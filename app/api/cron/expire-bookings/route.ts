import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { generateBookingCode, generateCancelToken } from "@/lib/code-generator";
import { sendBookingConfirmationEmail } from "@/lib/email";

/**
 * GET /api/cron/expire-bookings
 *
 * Housekeeping job — meant to run every few minutes (Vercel Cron and/or an
 * external scheduler). It does three things:
 *   1. Reconcile: catch recent PENDING bookings that were actually paid but
 *      whose webhook never arrived (money charged, no session) and confirm them.
 *   2. Expire: mark abandoned PENDING (> 30 min) as EXPIRED so they stop
 *      blocking availability.
 *   3. Auto-finish: close ACTIVE sessions whose endTime already passed (the
 *      tablet died / never sent "finish") so the puesto isn't locked forever.
 *
 * Auth: a Vercel Cron request (carries `x-vercel-cron`) OR a Bearer CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  const isVercelCron = req.headers.get("x-vercel-cron") != null;
  const authHeader = req.headers.get("authorization");
  const hasSecret = !!cronSecret && authHeader === `Bearer ${cronSecret}`;
  // Fail closed: only Vercel Cron or a caller with the secret may run this.
  if (!isVercelCron && !hasSecret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = Date.now();

  // ── 1. Reconcile recent PENDING against MercadoPago (webhook safety net) ──
  let reconciled = 0;
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (accessToken) {
    const recentPending = await prisma.booking.findMany({
      where: {
        status: "PENDING",
        createdAt: { gte: new Date(now - 3 * 60 * 60 * 1000) }, // last 3h
      },
      include: { puesto: true },
      take: 40,
    });
    if (recentPending.length > 0) {
      const client = new MercadoPagoConfig({ accessToken });
      const paymentApi = new Payment(client);
      const bizSettings = await prisma.businessSettings.findFirst();
      for (const b of recentPending) {
        try {
          // A booking's payment is tagged with external_reference = its id
          // (online) or "direct-{id}" (tablet walk-in).
          const search = await paymentApi.search({
            options: { external_reference: b.id },
          });
          let pay = (search.results ?? []).find((p) => p.status === "approved");
          let isDirect = false;
          if (!pay) {
            const search2 = await paymentApi.search({
              options: { external_reference: `direct-${b.id}` },
            });
            pay = (search2.results ?? []).find((p) => p.status === "approved");
            isDirect = !!pay;
          }
          if (!pay) continue;

          const mpPaymentId = pay.id != null ? String(pay.id) : null;
          if (!mpPaymentId) continue;
          const amount = pay.transaction_amount
            ? Math.round(pay.transaction_amount * 100)
            : b.price;

          if (isDirect) {
            // Walk-in QR: activate the session now (as the webhook would).
            const endTime = new Date(now + b.duration * 60 * 1000);
            await prisma.$transaction(async (tx) => {
              await tx.booking.update({
                where: { id: b.id },
                data: { status: "ACTIVE", startTime: new Date(now), endTime, paymentId: mpPaymentId },
              });
              await tx.payment.upsert({
                where: { bookingId: b.id },
                create: { bookingId: b.id, mpPaymentId, amount, status: "approved" },
                update: { status: "approved", mpPaymentId },
              });
            });
          } else {
            // Online booking: confirm as PAID, generate code, email it.
            let code = generateBookingCode();
            while (await prisma.booking.findUnique({ where: { code }, select: { id: true } })) {
              code = generateBookingCode();
            }
            const cancelToken = generateCancelToken();
            await prisma.$transaction(async (tx) => {
              await tx.booking.update({
                where: { id: b.id },
                data: { status: "PAID", code, paymentId: mpPaymentId, cancelToken },
              });
              await tx.payment.upsert({
                where: { bookingId: b.id },
                create: { bookingId: b.id, mpPaymentId, amount, status: "approved" },
                update: { status: "approved", mpPaymentId },
              });
            });
            const emailTo = b.customerEmail ?? process.env.EMAIL_FALLBACK;
            if (bizSettings?.emailEnabled !== false && emailTo) {
              const startTime = b.startTime
                ? b.startTime.toLocaleString("es-AR", {
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
                emailTo, code, b.duration, startTime, b.puesto.name, bizSettings?.emailFrom, cancelUrl
              ).catch((e) => console.error("[cron reconcile] email:", e));
            }
          }
          reconciled++;
        } catch (e) {
          console.error("[cron reconcile] booking", b.id, e);
        }
      }
    }
  }

  // ── 2. Expire abandoned PENDING > 30 min ─────────────────────────────────
  const expired = await prisma.booking.updateMany({
    where: { status: "PENDING", createdAt: { lt: new Date(now - 30 * 60 * 1000) } },
    data: { status: "EXPIRED" },
  });

  // ── 3. Auto-finish ACTIVE sessions past their end (5-min grace) ──────────
  // Safety net so a dead tablet never leaves a puesto ACTIVE (and blocked) forever.
  const finished = await prisma.booking.updateMany({
    where: { status: "ACTIVE", endTime: { not: null, lt: new Date(now - 5 * 60 * 1000) } },
    data: { status: "FINISHED" },
  });

  return NextResponse.json({
    ok: true,
    reconciled,
    expired: expired.count,
    autoFinished: finished.count,
    at: new Date(now).toISOString(),
  });
}
