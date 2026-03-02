import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { generateBookingCode } from "@/lib/code-generator";
import { sendBookingConfirmationEmail } from "@/lib/email";

/**
 * GET /api/bookings/[id]/verify-payment?paymentId=xxx
 *
 * Called from the confirmation page after MercadoPago redirects back.
 * Verifies payment status directly with MP API and marks booking as PAID.
 * This is the fallback for when the webhook cannot reach localhost.
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

  // Fetch current booking
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { puesto: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }

  // Already confirmed — return it as-is
  if (booking.status === "PAID" || booking.status === "ACTIVE") {
    return NextResponse.json(booking);
  }

  // Verify with MercadoPago
  let mpStatus: string | null | undefined;
  let mpAmount: number | null | undefined;
  try {
    const client = new MercadoPagoConfig({ accessToken });
    const paymentApi = new Payment(client);
    const mpPayment = await paymentApi.get({ id: paymentId });
    mpStatus = mpPayment.status;
    mpAmount = mpPayment.transaction_amount;

    if (mpStatus !== "approved") {
      return NextResponse.json({
        ...booking,
        _mpStatus: mpStatus,
      });
    }

    // Payment is approved — generate code and mark as PAID
    if (booking.status !== "PENDING") {
      return NextResponse.json(booking);
    }

    let code = generateBookingCode();
    let exists = await prisma.booking.findUnique({ where: { code } });
    while (exists) {
      code = generateBookingCode();
      exists = await prisma.booking.findUnique({ where: { code } });
    }

    const mpPaymentIdStr = String(paymentId);

    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "PAID", code, paymentId: mpPaymentIdStr },
      });
      // Upsert payment record (webhook may have already created it)
      await tx.payment.upsert({
        where: { bookingId: booking.id },
        create: {
          bookingId: booking.id,
          mpPaymentId: mpPaymentIdStr,
          amount: mpAmount ? Math.round(mpAmount * 100) : booking.price,
          status: "approved",
        },
        update: {
          status: "approved",
          mpPaymentId: mpPaymentIdStr,
        },
      });
    });

    // Send confirmation email
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
      try {
        await sendBookingConfirmationEmail(
          emailTo,
          code,
          booking.duration,
          startTime,
          booking.puesto.name,
          bizSettings?.emailFrom
        );
      } catch (emailErr) {
        console.error("[verify-payment] email error:", emailErr);
      }
    }

    const updated = await prisma.booking.findUnique({
      where: { id },
      include: { puesto: true },
    });
    return NextResponse.json(updated);
  } catch (err) {
    console.error("[verify-payment] error:", err);
    // Return current booking state even on MP API error
    return NextResponse.json(booking);
  }
}
