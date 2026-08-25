import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MercadoPagoConfig, Payment } from "mercadopago";
import { generateBookingCode } from "@/lib/code-generator";
import { sendBookingConfirmationEmail } from "@/lib/email";
import type { Booking, Puesto } from "@prisma/client";
import { logger } from "@/lib/logger";

type GroupBooking = Booking & { puesto: Puesto };

/** Vista pública segura del grupo (misma forma que GET /group/[groupId]). */
function groupView(bookings: GroupBooking[]) {
  const first = bookings[0];
  return {
    status: first.status,
    code: first.groupCode,
    count: bookings.length,
    duration: first.duration,
    startTime: first.startTime,
    total: bookings.reduce((s, b) => s + b.price, 0),
    puestos: bookings.map((b) => b.puesto.name),
  };
}

/**
 * GET /api/bookings/group/[groupId]/verify-payment?paymentId=xxx
 *
 * Fallback para la página de confirmación cuando el webhook del grupo tarda.
 * Confirma el grupo SOLO si el pago de MercadoPago corresponde a ese grupo
 * (external_reference = "group-<groupId>") y cubre el total.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ groupId: string }> }
) {
  const { groupId } = await params;
  const { searchParams } = new URL(req.url);
  const paymentId = searchParams.get("paymentId");
  if (!paymentId) {
    return NextResponse.json({ error: "paymentId requerido" }, { status: 400 });
  }
  const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!accessToken) {
    return NextResponse.json({ error: "MP no configurado" }, { status: 500 });
  }

  const bookings = await prisma.booking.findMany({
    where: { groupId },
    include: { puesto: true },
    orderBy: { puesto: { name: "asc" } },
  });
  if (!bookings.length) {
    return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
  }

  // Ya confirmado → devolver la vista.
  if (bookings[0].groupCode && bookings.some((b) => b.status === "PAID" || b.status === "ACTIVE")) {
    return NextResponse.json(groupView(bookings));
  }

  try {
    const client = new MercadoPagoConfig({ accessToken });
    const paymentApi = new Payment(client);
    const mp = await paymentApi.get({ id: paymentId });

    if (mp.status !== "approved") {
      return NextResponse.json(groupView(bookings));
    }
    if (mp.external_reference !== `group-${groupId}`) {
      return NextResponse.json({ error: "El pago no corresponde a este grupo" }, { status: 400 });
    }
    const total = bookings.reduce((s, b) => s + b.price, 0);
    const paidCents = mp.transaction_amount ? Math.round(mp.transaction_amount * 100) : 0;
    if (paidCents < total) {
      return NextResponse.json({ error: "El monto del pago no coincide con el grupo" }, { status: 400 });
    }
    if (bookings.every((b) => b.status !== "PENDING")) {
      return NextResponse.json(groupView(bookings));
    }

    const mpPaymentId = String(paymentId);
    // Un código compartido para todo el grupo (sin choque con grupos vivos).
    let code = generateBookingCode();
    while (
      await prisma.booking.findFirst({
        where: { groupCode: code, status: { in: ["PENDING", "PAID", "ACTIVE"] } },
        select: { id: true },
      })
    ) {
      code = generateBookingCode();
    }

    // Claim ATÓMICO del grupo (mismo patrón que el webhook): una sola sentencia
    // marca PAID+groupCode a los que sigan PENDING. Si el webhook (u otra
    // llamada) ya confirmó el grupo, count===0 → devolvemos su código, sin pisar
    // el groupCode ya emitido ni mandar un segundo email.
    const claimed = await prisma.booking.updateMany({
      where: { groupId, status: "PENDING" },
      data: { status: "PAID", groupCode: code, paymentId: mpPaymentId },
    });
    if (claimed.count === 0) {
      const current = await prisma.booking.findMany({
        where: { groupId },
        include: { puesto: true },
        orderBy: { puesto: { name: "asc" } },
      });
      return NextResponse.json(groupView(current.length ? current : bookings));
    }
    // Registrar pagos (idempotente por bookingId).
    for (const b of bookings) {
      if (b.status !== "PENDING") continue;
      await prisma.payment.upsert({
        where: { bookingId: b.id },
        create: { bookingId: b.id, mpPaymentId, amount: b.price, status: "approved" },
        update: { status: "approved", mpPaymentId },
      });
    }

    const email = bookings.find((b) => b.customerEmail)?.customerEmail;
    if (email) {
      const bizSettings = await prisma.businessSettings.findFirst();
      if (bizSettings?.emailEnabled !== false) {
        const first = bookings[0];
        const when = first.startTime
          ? first.startTime.toLocaleString("es-AR", {
              dateStyle: "long",
              timeStyle: "short",
              timeZone: "America/Argentina/Buenos_Aires",
            })
          : "A confirmar";
        try {
          await sendBookingConfirmationEmail(
            email,
            code,
            first.duration,
            when,
            `Grupo de ${bookings.length} simuladores`,
            bizSettings?.emailFrom,
            null
          );
        } catch (e) {
          logger.error("verify.group.email", { groupId }, e);
        }
      }
    }

    const updated = await prisma.booking.findMany({
      where: { groupId },
      include: { puesto: true },
      orderBy: { puesto: { name: "asc" } },
    });
    return NextResponse.json(groupView(updated.length ? updated : bookings));
  } catch (e) {
    logger.error("verify.group.failed", { groupId }, e);
    return NextResponse.json(groupView(bookings));
  }
}
