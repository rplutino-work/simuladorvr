import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { generateBookingCode, generateCancelToken } from "@/lib/code-generator";
import { sendBookingConfirmationEmail } from "@/lib/email";

/**
 * POST /api/webhooks/mercadopago
 * MercadoPago webhook for payment notifications
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // MP sends different payloads - handle payment.created/updated
    const type = body.type ?? body.action;
    if (type !== "payment" && type !== "payment.created" && type !== "payment.updated") {
      return NextResponse.json({ ok: true });
    }

    const paymentId = body.data?.id ?? body.id;
    if (!paymentId) {
      return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ error: "MP not configured" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const paymentApi = new Payment(client);
    const mpPayment = await paymentApi.get({ id: paymentId.toString() });

    if (mpPayment.status !== "approved") {
      return NextResponse.json({ ok: true });
    }

    const mpPaymentId = mpPayment.id != null ? String(mpPayment.id) : null;
    if (!mpPaymentId) {
      return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
    }

    const externalRef = mpPayment.external_reference ?? mpPayment.metadata?.booking_id;
    if (!externalRef) {
      return NextResponse.json({ error: "Missing booking reference" }, { status: 400 });
    }

    // ── Extension payment: "ext-{bookingId}-{additionalMinutes}" ──────────
    if (externalRef.startsWith("ext-")) {
      const parts = externalRef.split("-");
      // format: ext-{bookingId}-{additionalMinutes}
      const additionalMinutes = parseInt(parts[parts.length - 1], 10);
      const bookingId = parts.slice(1, -1).join("-");

      if (!bookingId || isNaN(additionalMinutes)) {
        return NextResponse.json({ error: "Invalid extension reference" }, { status: 400 });
      }

      const extBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!extBooking || extBooking.status !== "ACTIVE") {
        return NextResponse.json({ ok: true }); // session may have ended, ignore
      }

      const currentEnd = extBooking.endTime ?? new Date();
      const newEnd = new Date(currentEnd.getTime() + additionalMinutes * 60 * 1000);

      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: bookingId },
          data: { endTime: newEnd },
        });
        await tx.payment.upsert({
          where: { bookingId },
          create: {
            bookingId,
            mpPaymentId,
            amount: mpPayment.transaction_amount ? Math.round(mpPayment.transaction_amount * 100) : 0,
            status: "approved",
          },
          update: {
            status: "approved",
          },
        });
      });

      return NextResponse.json({ ok: true });
    }

    // ── Normal booking payment ─────────────────────────────────────────────
    const booking = await prisma.booking.findUnique({
      where: { id: externalRef },
      include: { puesto: true },
    });

    if (!booking) {
      return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    }

    if (booking.status === "PAID") {
      return NextResponse.json({ ok: true });
    }

    // Generate unique code and cancel token
    let code = generateBookingCode();
    let exists = await prisma.booking.findUnique({ where: { code } });
    while (exists) {
      code = generateBookingCode();
      exists = await prisma.booking.findUnique({ where: { code } });
    }
    const cancelToken = generateCancelToken();

    // Update booking and create payment record
    await prisma.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "PAID", code, paymentId: mpPaymentId, cancelToken },
      });
      await tx.payment.create({
        data: {
          bookingId: booking.id,
          mpPaymentId,
          amount: mpPayment.transaction_amount ? Math.round(mpPayment.transaction_amount * 100) : booking.price,
          status: "approved",
        },
      });
    });

    // Check emailEnabled setting
    const bizSettings = await prisma.businessSettings.findFirst();
    const emailEnabled = bizSettings?.emailEnabled !== false;

    // Send confirmation email
    const email = booking.customerEmail ?? process.env.EMAIL_FALLBACK;
    if (emailEnabled && email) {
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
      await sendBookingConfirmationEmail(
        email,
        code,
        booking.duration,
        startTime,
        booking.puesto.name,
        bizSettings?.emailFrom,
        cancelUrl
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[webhook mercadopago]", error);
    return NextResponse.json(
      { error: "Webhook error" },
      { status: 500 }
    );
  }
}
