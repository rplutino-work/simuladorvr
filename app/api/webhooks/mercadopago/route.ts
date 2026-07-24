import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { generateBookingCode, generateCancelToken } from "@/lib/code-generator";
import { sendBookingConfirmationEmail } from "@/lib/email";
import { logger } from "@/lib/logger";

/**
 * Validates MercadoPago's `x-signature` HMAC. Only enforced when
 * MERCADOPAGO_WEBHOOK_SECRET is configured (so an un-configured deploy keeps
 * working); once set, forged/replayed notifications are rejected.
 */
function signatureValid(req: NextRequest, dataId: string): boolean {
  const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
  if (!secret) return true; // not configured yet — don't block
  const sig = req.headers.get("x-signature");
  const reqId = req.headers.get("x-request-id");
  if (!sig || !reqId) return false;
  const parts: Record<string, string> = {};
  for (const p of sig.split(",")) {
    const [k, v] = p.split("=");
    if (k && v) parts[k.trim()] = v.trim();
  }
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;
  const manifest = `id:${dataId};request-id:${reqId};ts:${ts};`;
  const hmac = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(v1));
  } catch {
    return false;
  }
}

/**
 * POST /api/webhooks/mercadopago — payment notifications from MercadoPago.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const type = body.type ?? body.action;
    if (type !== "payment" && type !== "payment.created" && type !== "payment.updated") {
      return NextResponse.json({ ok: true });
    }

    const paymentId = body.data?.id ?? body.id;
    if (!paymentId) {
      return NextResponse.json({ error: "Missing payment id" }, { status: 400 });
    }

    // Signature is defense-in-depth, NOT the source of truth: below we re-fetch
    // the payment from MercadoPago with our secret access token and validate its
    // external_reference + amount + approved status, so a forged notification
    // can't activate anything. MP's preference-level notifications (IPN) often
    // arrive WITHOUT x-signature — rejecting those (401) silently dropped real
    // paid sessions. So we log a mismatch but never block a genuine payment.
    if (!signatureValid(req, String(paymentId))) {
      logger.warn("webhook.signature.invalid", { paymentId: String(paymentId) });
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
    const paidCents = mpPayment.transaction_amount
      ? Math.round(mpPayment.transaction_amount * 100)
      : 0;

    const externalRef = mpPayment.external_reference ?? mpPayment.metadata?.booking_id;
    if (!externalRef) {
      return NextResponse.json({ error: "Missing booking reference" }, { status: 400 });
    }

    // ── Direct tablet purchase: "direct-{bookingId}" ──────────────────────
    if (externalRef.startsWith("direct-")) {
      const bookingId = externalRef.slice("direct-".length);
      if (!bookingId) {
        return NextResponse.json({ error: "Invalid direct reference" }, { status: 400 });
      }

      const directBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!directBooking) {
        return NextResponse.json({ error: "Booking not found" }, { status: 404 });
      }
      if (directBooking.status === "ACTIVE" || directBooking.status === "FINISHED") {
        return NextResponse.json({ ok: true });
      }
      // Underpaid → don't activate (never give a session for less than its price).
      if (paidCents > 0 && paidCents < directBooking.price) {
        return NextResponse.json({ ok: true, underpaid: true });
      }
      // Paid over a cancelled/expired booking → orphan payment; the cron
      // reconciler / admin handles the refund. Do not silently activate.
      if (directBooking.status === "CANCELLED" || directBooking.status === "EXPIRED") {
        return NextResponse.json({ ok: true, wasCancelled: true });
      }

      const now = new Date();
      const newEnd = new Date(now.getTime() + directBooking.duration * 60 * 1000);
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: bookingId },
          data: { status: "ACTIVE", startTime: now, endTime: newEnd, paymentId: mpPaymentId },
        });
        await tx.payment.upsert({
          where: { bookingId },
          create: { bookingId, mpPaymentId, amount: paidCents || directBooking.price, status: "approved" },
          update: { status: "approved", mpPaymentId },
        });
      });
      return NextResponse.json({ ok: true });
    }

    // ── Extension payment: "ext-{bookingId}-{additionalMinutes}" ──────────
    if (externalRef.startsWith("ext-")) {
      const parts = externalRef.split("-");
      const additionalMinutes = parseInt(parts[parts.length - 1], 10);
      const bookingId = parts.slice(1, -1).join("-");
      if (!bookingId || isNaN(additionalMinutes)) {
        return NextResponse.json({ error: "Invalid extension reference" }, { status: 400 });
      }

      const extBooking = await prisma.booking.findUnique({ where: { id: bookingId } });
      if (!extBooking || extBooking.status !== "ACTIVE") {
        return NextResponse.json({ ok: true });
      }
      // Idempotency: MP delivers each notification 2+ times. If this exact
      // payment was already applied, do nothing (otherwise the session gets
      // extended twice for one payment).
      if (extBooking.paymentId === mpPaymentId) {
        return NextResponse.json({ ok: true, alreadyApplied: true });
      }

      const currentEnd = extBooking.endTime ?? new Date();
      const newEnd = new Date(currentEnd.getTime() + additionalMinutes * 60 * 1000);
      await prisma.$transaction(async (tx) => {
        await tx.booking.update({
          where: { id: bookingId },
          data: { endTime: newEnd, paymentId: mpPaymentId },
        });
        await tx.payment.upsert({
          where: { bookingId },
          create: { bookingId, mpPaymentId, amount: paidCents, status: "approved" },
          update: { status: "approved", mpPaymentId },
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
    if (paidCents > 0 && paidCents < booking.price) {
      return NextResponse.json({ ok: true, underpaid: true });
    }
    // Only confirm a still-PENDING booking (idempotent for duplicate webhooks;
    // no auto-revive of CANCELLED/EXPIRED — the reconciler/admin handles those).
    if (booking.status !== "PENDING") {
      return NextResponse.json({ ok: true, skipped: booking.status });
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
        data: { status: "PAID", code, paymentId: mpPaymentId, cancelToken },
      });
      await tx.payment.upsert({
        where: { bookingId: booking.id },
        create: { bookingId: booking.id, mpPaymentId, amount: paidCents || booking.price, status: "approved" },
        update: { status: "approved", mpPaymentId },
      });
    });

    const bizSettings = await prisma.businessSettings.findFirst();
    const emailEnabled = bizSettings?.emailEnabled !== false;
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
        bizSettings?.allowCancel && cancelToken ? `${baseUrl}/cancelar?token=${cancelToken}` : null;
      await sendBookingConfirmationEmail(
        email, code, booking.duration, startTime, booking.puesto.name, bizSettings?.emailFrom, cancelUrl
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("webhook.mercadopago.failed", {}, error);
    return NextResponse.json({ error: "Webhook error" }, { status: 500 });
  }
}
