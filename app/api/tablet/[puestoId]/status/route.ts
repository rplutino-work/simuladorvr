import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
      include: { puesto: true },
      orderBy: { startTime: "desc" },
    }),
    prisma.puesto.findUnique({ where: { id: puestoId }, select: { active: true, name: true } }),
    prisma.businessSettings.findFirst({ select: { openHour: true, closeHour: true } }),
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

  if (!booking) {
    // No active session — check if the last session for this puesto finished
    // recently so the TV can show "SESIÓN FINALIZADA" even after a cold restart.
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

  const endTime = booking.endTime ?? new Date(now.getTime() + booking.duration * 60 * 1000);
  const remainingMs = Math.max(0, endTime.getTime() - now.getTime());

  return NextResponse.json({
    session: {
      bookingId: booking.id,
      code: booking.code,
      customerName: booking.customerName,
      endTime: endTime.toISOString(),
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
