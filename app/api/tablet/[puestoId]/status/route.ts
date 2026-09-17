import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCachedSettings } from "@/lib/cache";

// A FINISHED session is reported as `recentlyFinished` for this long after
// it ended, so the TV (whose WebView may have been killed while on HDMI)
// can still show the "SESIÓN FINALIZADA" message on cold restart.
const RECENTLY_FINISHED_WINDOW_MS = 2 * 60 * 1000; // 2 minutes

/**
 * GET /api/tablet/[puestoId]/status
 *
 * Returns the current ACTIVE session for a given puesto,
 * plus schedule/availability info for TV screen power management.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ puestoId: string }> }
) {
  const { puestoId } = await params;

  const [booking, puesto, settings] = await Promise.all([
    prisma.booking.findFirst({
      where: { puestoId, status: "ACTIVE" },
      orderBy: { startTime: "desc" },
      select: {
        id: true,
        code: true,
        customerName: true,
        endTime: true,
        duration: true,
        status: true,
        puesto: { select: { name: true } },
      },
    }),
    prisma.puesto.findUnique({ where: { id: puestoId }, select: { active: true, name: true } }),
    getCachedSettings(), // cached — no Postgres hit on most polls
  ]);

  const now = new Date();
  const buenosAiresHour = parseInt(
    now.toLocaleString("en-US", { hour: "numeric", hour12: false, timeZone: "America/Argentina/Buenos_Aires" })
  );
  const openHour = settings?.openHour ?? 10;
  const closeHour = settings?.closeHour ?? 20;
  const withinSchedule = buenosAiresHour >= openHour && buenosAiresHour < closeHour;
  const puestoActive = puesto?.active ?? true;
  const screenOn = withinSchedule && puestoActive;

  // Fin efectivo del turno. `endTime` puede ser null en el schema → fallback a
  // ahora+duración (mismo comportamiento que antes).
  const sessionEndTime = booking
    ? booking.endTime ?? new Date(now.getTime() + booking.duration * 60 * 1000)
    : null;

  // Guard server-side (fin de turno INSTANTÁNEO, sin depender del cron): sólo es
  // una sesión VIVA un booking ACTIVE cuyo `endTime` todavía no pasó. Un ACTIVE con
  // endTime vencido (el cron auto-finish tiene 5 min de gracia y corre cada ~10 min
  // → puede tardar hasta ~15 min en marcarlo FINISHED) NO se reporta como sesión →
  // la TV vuelve a DISPONIBLE apenas termina el turno. (`booking.status === "ACTIVE"`
  // ya lo garantiza el query; se chequea explícito por defensa.)
  if (
    !booking ||
    booking.status !== "ACTIVE" ||
    !sessionEndTime ||
    sessionEndTime.getTime() <= now.getTime()
  ) {
    // Sin sesión viva — buscar la última FINISHED reciente para que la TV muestre
    // "SESIÓN FINALIZADA" aun tras un cold restart.
    const windowStart = new Date(now.getTime() - RECENTLY_FINISHED_WINDOW_MS);
    const lastFinished = await prisma.booking.findFirst({
      where: {
        puestoId,
        status: "FINISHED",
        endTime: { gte: windowStart, lte: now },
      },
      orderBy: { endTime: "desc" },
      select: { id: true, customerName: true, duration: true, endTime: true },
    });

    return NextResponse.json({
      session: null,
      recentlyFinished: lastFinished
        ? {
            bookingId: lastFinished.id,
            customerName: lastFinished.customerName,
            duration: lastFinished.duration,
            finishedAt: lastFinished.endTime,
          }
        : null,
      screenOn,
      puestoActive,
      withinSchedule,
      puestoName: puesto?.name ?? null,
    });
  }

  const remainingMs = Math.max(0, sessionEndTime.getTime() - now.getTime());

  return NextResponse.json({
    session: {
      bookingId: booking.id,
      code: booking.code,
      customerName: booking.customerName,
      endTime: sessionEndTime.toISOString(),
      remainingMs,
      duration: booking.duration,
      puestoName: booking.puesto.name,
    },
    screenOn: true,
    puestoActive,
    withinSchedule,
    puestoName: booking.puesto.name,
  });
}
