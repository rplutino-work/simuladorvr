import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isSlotAvailable } from "@/lib/availability";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { withPuestoLock } from "@/lib/booking-lock";
import { checkPromoValidity } from "@/lib/promo";

/**
 * POST /api/tablet/activate
 * Body: { code: string, puestoId: string }
 *
 * Validates a booking code for a given puesto and starts the session.
 * - Finds PAID booking matching code + puestoId
 * - Sets status = ACTIVE, recalculates endTime from now
 */
export async function POST(req: NextRequest) {
  let body: { code?: string; puestoId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  try {
    const { code, puestoId } = body;

    if (!code || !puestoId) {
      return NextResponse.json({ error: "Código y puesto requeridos" }, { status: 400 });
    }

    // Brute-forcing the 4-char code (probing valid codes to hijack sessions) is
    // stopped here: max 15 attempts / 5 min per IP+puesto.
    const rl = await rateLimit(`activate:${clientIp(req)}:${puestoId}`, 15, 5 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos. Esperá un momento e intentá de nuevo." },
        { status: 429 }
      );
    }

    const normalizedCode = String(code).toUpperCase().trim();

    // ── Códigos promocionales / cortesía (DB, admin) ──────────────────────────
    // TODOS los códigos gratis viven en la tabla PromoCode, editables desde
    // /admin/promociones: la prueba gratis pública (8888), la prueba staff (RRRR)
    // y cualquier promo nueva. No hay códigos cableados. Cada uno define minutos,
    // usos máximos, vigencia por fechas, cooldown por simulador y día/horario. El
    // canje no pisa una sesión en curso ni la próxima reserva.
    const promo = await prisma.promoCode.findUnique({ where: { code: normalizedCode } });
    if (promo) {
      const invalid = checkPromoValidity(promo);
      if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });
      const puesto = await prisma.puesto.findUnique({
        where: { id: puestoId },
        select: { name: true, active: true },
      });
      if (!puesto || !puesto.active)
        return NextResponse.json({ error: "Este simulador no está disponible." }, { status: 404 });
      const now = new Date();
      const endTime = new Date(now.getTime() + promo.minutes * 60 * 1000);
      const note = `[Promo ${promo.code} - ${promo.minutes}min]`;
      const outcome = await withPuestoLock(puestoId, async (tx) => {
        const active = await tx.booking.findFirst({
          where: { puestoId, status: "ACTIVE" },
          select: { id: true },
        });
        if (active) return "busy" as const;
        if (promo.cooldownMin > 0) {
          const recent = await tx.booking.findFirst({
            where: {
              puestoId,
              price: 0,
              notes: note,
              startTime: { gte: new Date(now.getTime() - promo.cooldownMin * 60 * 1000) },
            },
            select: { id: true },
          });
          if (recent) return "cooldown" as const;
        }
        const free = await isSlotAvailable(puestoId, now, endTime, undefined, tx);
        if (!free) return "collision" as const;
        // Consumo del uso de forma ATÓMICA (dos canjes simultáneos en distintos
        // simuladores no pueden pasarse del máximo).
        if (promo.maxUses != null) {
          const upd = await tx.promoCode.updateMany({
            where: { id: promo.id, usedCount: { lt: promo.maxUses } },
            data: { usedCount: { increment: 1 } },
          });
          if (upd.count === 0) return "maxed" as const;
        } else {
          await tx.promoCode.update({ where: { id: promo.id }, data: { usedCount: { increment: 1 } } });
        }
        return tx.booking.create({
          data: {
            puestoId,
            duration: promo.minutes,
            price: 0,
            status: "ACTIVE",
            startTime: now,
            endTime,
            notes: note,
          },
        });
      });
      if (outcome === "busy")
        return NextResponse.json({ error: "El simulador ya tiene una sesión en curso. Esperá a que termine." }, { status: 409 });
      if (outcome === "cooldown")
        return NextResponse.json({ error: "Este código ya se usó en este simulador hace poco. Probá en otro." }, { status: 429 });
      if (outcome === "collision")
        return NextResponse.json({ error: "No hay lugar ahora (hay una reserva próxima). Avisá al operador." }, { status: 409 });
      if (outcome === "maxed")
        return NextResponse.json({ error: "Este código ya alcanzó su límite de usos." }, { status: 409 });
      return NextResponse.json({
        bookingId: outcome.id,
        code: normalizedCode,
        customerName: null,
        endTime: endTime.toISOString(),
        duration: promo.minutes,
        puestoName: puesto.name,
        resumed: false,
        trial: true,
      });
    }

    // Match an individual booking (`code`) OR a group booking (`groupCode`).
    // Group reservations share one code across their puestos and store it in
    // `groupCode` (with `code` null), so each member starts their own puesto by
    // entering the shared code at that puesto's tablet. `groupCode` is only
    // unique among live bookings, so order newest-first to prefer the current
    // group over a finished one that happened to reuse the same code.
    const booking = await prisma.booking.findFirst({
      where: {
        puestoId,
        OR: [{ code: normalizedCode }, { groupCode: normalizedCode }],
      },
      include: { puesto: true },
      orderBy: { createdAt: "desc" },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Código inválido. Verificá que el código sea correcto y que estés en el simulador correcto." },
        { status: 404 }
      );
    }

    if (booking.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Esta reserva fue cancelada." },
        { status: 400 }
      );
    }
    if (booking.status === "EXPIRED") {
      return NextResponse.json(
        { error: "Esta reserva venció. Realizá una nueva reserva." },
        { status: 400 }
      );
    }
    if (booking.status === "FINISHED") {
      return NextResponse.json(
        { error: "Esta sesión ya fue completada." },
        { status: 400 }
      );
    }
    if (booking.status === "ACTIVE") {
      // Session already running — return current session data so tablet can resume display
      return NextResponse.json({
        bookingId: booking.id,
        code: booking.code ?? booking.groupCode,
        customerName: booking.customerName,
        endTime: booking.endTime,
        duration: booking.duration,
        puestoName: booking.puesto.name,
        resumed: true,
      });
    }
    if (booking.status !== "PAID") {
      return NextResponse.json(
        { error: "Esta reserva no está confirmada. Completá el pago primero." },
        { status: 400 }
      );
    }

    // Activate under a per-puesto lock so two codes presented at the same time
    // can't both start a session (which would leave two ACTIVE bookings).
    const now = new Date();
    const endTime = new Date(now.getTime() + booking.duration * 60 * 1000);

    const outcome = await withPuestoLock(puestoId, async (tx) => {
      // Another session already running?
      const activeOnPuesto = await tx.booking.findFirst({
        where: { puestoId, status: "ACTIVE", id: { not: booking.id } },
        select: { id: true },
      });
      if (activeOnPuesto) return "busy" as const;
      // The session runs from NOW — make sure it doesn't overlap the next reservation.
      const collisionFree = await isSlotAvailable(puestoId, now, endTime, booking.id, tx);
      if (!collisionFree) return "collision" as const;
      await tx.booking.update({
        where: { id: booking.id },
        data: { status: "ACTIVE", startTime: now, endTime },
      });
      return "ok" as const;
    });

    if (outcome === "busy") {
      return NextResponse.json(
        { error: "El simulador ya tiene una sesión en curso. Esperá a que termine." },
        { status: 409 }
      );
    }
    if (outcome === "collision") {
      return NextResponse.json(
        { error: "Tu sesión se superpondría con la próxima reserva de este simulador. Avisá al operador." },
        { status: 409 }
      );
    }

    return NextResponse.json({
      bookingId: booking.id,
      code: booking.code ?? booking.groupCode,
      customerName: booking.customerName,
      endTime: endTime.toISOString(),
      duration: booking.duration,
      puestoName: booking.puesto.name,
      resumed: false,
    });
  } catch (err) {
    console.error("[tablet/activate]", err);
    return NextResponse.json({ error: "Error interno. Intentá de nuevo." }, { status: 500 });
  }
}
