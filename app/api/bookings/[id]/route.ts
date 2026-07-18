import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/bookings/[id]
 * Public — the confirmation page polls this by bookingId. Returns ONLY the
 * fields that page needs; never the cancelToken, customerEmail or paymentId
 * (a leaked bookingId must not expose the cancellation secret or PII).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      code: true,
      duration: true,
      startTime: true,
      endTime: true,
      price: true,
      customerName: true,
      puesto: { select: { name: true } },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: "No encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ...booking, puestoName: booking.puesto.name });
}
