import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/bookings/group/[groupId]
 * Public: safe status for the confirmation page (polls until PAID + code).
 * Returns only non-sensitive fields.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ groupId: string }> }) {
  const { groupId } = await params;
  const bookings = await prisma.booking.findMany({
    where: { groupId },
    select: {
      status: true,
      groupCode: true,
      duration: true,
      startTime: true,
      price: true,
      puesto: { select: { name: true } },
    },
    orderBy: { puesto: { name: "asc" } },
  });
  if (!bookings.length) {
    return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });
  }
  const first = bookings[0];
  return NextResponse.json({
    status: first.status,
    code: first.groupCode,
    count: bookings.length,
    duration: first.duration,
    startTime: first.startTime,
    total: bookings.reduce((s, b) => s + b.price, 0),
    puestos: bookings.map((b) => b.puesto.name),
  });
}
