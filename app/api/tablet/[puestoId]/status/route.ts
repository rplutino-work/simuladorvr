import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/tablet/[puestoId]/status
 *
 * Returns the current ACTIVE session for a given puesto.
 * Polled every few seconds by the tablet to keep the countdown in sync.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ puestoId: string }> }
) {
  const { puestoId } = await params;

  const booking = await prisma.booking.findFirst({
    where: { puestoId, status: "ACTIVE" },
    include: { puesto: true },
    orderBy: { startTime: "desc" },
  });

  if (!booking) {
    return NextResponse.json({ session: null });
  }

  const now = new Date();
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
  });
}
