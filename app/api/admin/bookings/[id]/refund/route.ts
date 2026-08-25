import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

/**
 * POST /api/admin/bookings/[id]/refund  (admin/operator)
 *
 * Refunds a paid booking and cancels it. For MercadoPago payments it triggers
 * the MP refund; for cash/manual it just records the refund. Marking the
 * payment `refunded` also removes it from revenue metrics (which sum only
 * `approved`), fixing the "refunds still count as income" bug.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  // Reembolsar mueve plata real de MercadoPago → solo el ADMIN (dueño).
  // El operador no puede reembolsar aunque el botón exista en la UI.
  if (session?.user?.role !== "ADMIN") {
    return NextResponse.json(
      { error: "Solo un administrador puede reembolsar. Pedile al dueño." },
      { status: 403 }
    );
  }
  const { id } = await params;

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { payment: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }
  const payment = booking.payment;
  if (!payment) {
    // No payment on record — just cancel it.
    await prisma.booking.update({ where: { id }, data: { status: "CANCELLED" } });
    return NextResponse.json({ ok: true, refunded: false, reason: "Sin pago registrado" });
  }
  if (payment.status === "refunded") {
    return NextResponse.json({ ok: true, refunded: true, already: true });
  }

  const isManual = payment.mpPaymentId.startsWith("manual-");

  // Cash / manual payment → record the refund, no gateway call.
  if (isManual) {
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "refunded" } }),
      prisma.booking.update({ where: { id }, data: { status: "CANCELLED" } }),
    ]);
    return NextResponse.json({ ok: true, refunded: true, manual: true });
  }

  // MercadoPago refund.
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json(
      { error: "MercadoPago no configurado — reembolsá manualmente" },
      { status: 500 }
    );
  }
  try {
    const mpRes = await fetch(
      `https://api.mercadopago.com/v1/payments/${payment.mpPaymentId}/refunds`,
      { method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" } }
    );
    if (!mpRes.ok) {
      const err = await mpRes.json().catch(() => ({}));
      logger.error("refund.mp.rejected", { bookingId: id, mpPaymentId: payment.mpPaymentId }, err);
      return NextResponse.json(
        { error: "MercadoPago rechazó el reembolso. Revisá en la consola de MP." },
        { status: 502 }
      );
    }
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "refunded" } }),
      prisma.booking.update({ where: { id }, data: { status: "CANCELLED" } }),
    ]);
    return NextResponse.json({ ok: true, refunded: true });
  } catch (e) {
    logger.error("refund.exception", { bookingId: id, mpPaymentId: payment.mpPaymentId }, e);
    return NextResponse.json({ error: "Error al procesar el reembolso" }, { status: 500 });
  }
}
