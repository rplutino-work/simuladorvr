import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

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
    return NextResponse.json({
      session: null,
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
