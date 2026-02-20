import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/availability";

/**
 * PATCH /api/bookings/[id]/cancel
 * Cancel a booking if allowCancel and remaining time > cancelLimitHours
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { puesto: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }
  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Ya está cancelada" }, { status: 400 });
  }
  if (!["PENDING", "PAID"].includes(booking.status)) {
    return NextResponse.json(
      { error: "Solo se pueden cancelar reservas pendientes o pagadas" },
      { status: 400 }
    );
  }

  const settings = await getBusinessSettings();
  if (!settings.allowCancel) {
    return NextResponse.json(
      { error: "Las cancelaciones no están permitidas" },
      { status: 403 }
    );
  }

  const startTime = booking.startTime ? new Date(booking.startTime) : null;
  if (!startTime) {
    return NextResponse.json(
      { error: "Reserva sin horario definido" },
      { status: 400 }
    );
  }
  const limitTime = new Date();
  limitTime.setHours(limitTime.getHours() + settings.cancelLimitHours);
  if (startTime < limitTime) {
    return NextResponse.json(
      {
        error: `Solo se puede cancelar con al menos ${settings.cancelLimitHours} horas de anticipación`,
      },
      { status: 400 }
    );
  }

  await prisma.booking.update({
    where: { id },
    data: { status: "CANCELLED" },
  });
  return NextResponse.json({ ok: true });
}
