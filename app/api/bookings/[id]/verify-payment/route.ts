import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { generateBookingCode, generateCancelToken } from "@/lib/code-generator";
import { sendBookingConfirmationEmail } from "@/lib/email";
import type { Booking, Puesto } from "@prisma/client";

/**
 * Curated, safe view of a booking for a PUBLIC caller. Never leaks
 * cancelToken, customerEmail or paymentId (see IDOR hardening).
 */
function safeBooking(b: Booking & { puesto: Puesto }, extra?: Record<string, unknown>) {
  return {
    id: b.id,
    status: b.status,
    code: b.code,
    duration: b.duration,
    startTime: b.startTime,
    endTime: b.endTime,
    price: b.price,
    customerName: b.customerName,
    puesto: { name: b.puesto.name },
    puestoName: b.puesto.name,
    ...extra,
  };
}

/**
 * GET /api/bookings/[id]/verify-payment?paymentId=xxx
 *
 * Fallback for the confirmation page when the webhook is delayed. Confirms the
 * booking ONLY if the MercadoPago payment actually belongs to this booking and
 * covers its price — the paymentId alone is not trusted.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");

  if (!paymentId) {
    return NextResponse.json({ error: "paymentId requerido" }, { status: 400 });
  }

  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "MP no configurado" }, { status: 500 });
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { puesto: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  // Already confirmed — return the safe view
  if (booking.status === "PAID" || booking.status === "ACTIVE") {
    return NextResponse.json(safeBooking(booking));
  }

  let mpStatus: string | null | undefined;
  let mpAmount: number | null | undefined;
  try {
    const client = new MercadoPagoConfig({ accessToken });
    const paymentApi = new Payment(client);
    const mpPayment = await paymentApi.get({ id: paymentId });
    mpStatus = mpPayment.status;
    mpAmount = mpPayment.transaction_amount;

    if (mpStatus !== "approved") {
      return NextResponse.json(safeBooking(booking, { _mpStatus: mpStatus }));
    }

    // ── Bind the payment to THIS booking ────────────────────────────────────
    // Without these checks anyone could confirm any booking (even someone
    // else's, or a 120-min one) by pointing at a cheap approved payment, and
    // reuse the same paymentId indefinitely.
    if (mpPayment.external_reference !== id) {
      return NextResponse.json(
        { error: "El pago no corresponde a esta reserva" },
        { status: 400 }
      );
    }
    const paidCents = mpAmount ? Math.round(mpAmount * 100) : 0;
    if (paidCents < booking.price) {
      return NextResponse.json(
        { error: "El monto del pago no coincide con la reserva" },
        { status: 400 }
      );
    }
    const mpPaymentIdStr = String(paymentId);
    const reused = await prisma.payment.findFirst({
      where: { mpPaymentId: mpPaymentIdStr, bookingId: { not: booking.id } },
      select: { id: true },
    });
    if (reused) {
      return NextResponse.json({ error: "Pago ya utilizado" }, { status: 409 });
    }

    if (booking.status !== "PENDING") {
      return NextResponse.json(safeBooking(booking));
    }

    let code = generateBookingCode();
    let exists = await prisma.booking.findUnique({ where: { code } });
    while (exists) {
      code = generateBookingCode();
      exists = await prisma.booking.findUnique({ where: { code } });
    }

    const cancelToken = generateCancelToken();

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "PAID", code, paymentId: mpPaymentIdStr, cancelToken },
      });
      await tx.payment.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          mpPaymentId: mpPaymentIdStr,
          amount: paidCents || booking.price,
          status: "approved",
        },
        update: { status: "approved", mpPaymentId: mpPaymentIdStr },
      });
    });

    const bizSettings = await prisma.businessSettings.findFirst();
    const emailOk = bizSettings?.emailEnabled !== false;
    const emailTo = booking.customerEmail ?? process.env.EMAIL_FALLBACK;
    if (emailOk && emailTo) {
      const startTime = booking.startTime
        ? booking.startTime.toLocaleString("es-AR", {
            dateStyle: "long",
            timeStyle: "short",
            timeZone: "America/Argentina/Buenos_Aires",
          })
        : "A confirmar";
      const baseUrl = process.env.NEXTAUTH_URL ?? "";
      const cancelUrl =
        bizSettings?.allowCancel && cancelToken
          ? `${baseUrl}/cancelar?token=${cancelToken}`
          : null;
      try {
        await sendBookingConfirmationEmail(
          emailTo,
          code,
          booking.duration,
          startTime,
          booking.puesto.name,
          bizSettings?.emailFrom,
          cancelUrl
        );
      } catch (emailErr) {
        console.error("[verify-payment] email error:", emailErr);
      }
    }

    const updated = await prisma.booking.findUnique({
      where: { id },
      include: { puesto: true },
    });
    return NextResponse.json(updated ? safeBooking(updated) : safeBooking(booking));
  } catch (err) {
    console.error("[verify-payment] error:", err);
    return NextResponse.json(safeBooking(booking));
  }
}
