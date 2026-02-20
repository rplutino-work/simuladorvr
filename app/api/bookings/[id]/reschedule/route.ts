import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBusinessSettings, isSlotAvailable } from "@/lib/availability";
import { rescheduleSchema } from "@/lib/validations/booking";

/**
 * PATCH /api/bookings/[id]/reschedule
 * Body: { newStartTime: ISO string }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "newStartTime requerido (ISO)" },
      { status: 400 }
    );
  }

  const booking = await prisma.booking.findUnique({
    where: { id },
    include: { puesto: true },
  });
  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
  }
  if (!["PENDING", "PAID"].includes(booking.status)) {
    return NextResponse.json(
      { error: "Solo se puede reprogramar reservas pendientes o pagadas" },
      { status: 400 }
    );
  }

  const settings = await getBusinessSettings();
  if (!settings.allowReschedule) {
    return NextResponse.json(
      { error: "La reprogramación no está permitida" },
      { status: 403 }
    );
  }

  const newStart = new Date(parsed.data.newStartTime);
  const newEnd = new Date(newStart.getTime() + booking.duration * 60 * 1000);

  const available = await isSlotAvailable(
    booking.puestoId,
    newStart,
    newEnd,
    id
  );
  if (!available) {
    return NextResponse.json(
      { error: "El nuevo horario no está disponible" },
      { status: 409 }
    );
  }

  await prisma.booking.update({
    where: { id },
    data: { startTime: newStart, endTime: newEnd },
  });
  return NextResponse.json({ ok: true });
}
