import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/bookings/[id]
 * Get booking by ID (public - for status polling)
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { puesto: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json(booking);
}
