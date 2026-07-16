import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/tablet/finish
 * Body: { bookingId: string, puestoId: string }
 *
 * Manually finishes a session from the tablet.
 */
export async function POST(req: NextRequest) {
  let body: { bookingId?: string; puestoId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  try {
    const { bookingId, puestoId } = body;

    if (!bookingId || !puestoId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, puestoId },
    });

    if (!booking) {
      return NextResponse.json({ error: "Reserva no encontrada" }, { status: 404 });
    }

    if (!["ACTIVE"].includes(booking.status)) {
      return NextResponse.json({ error: "La sesión no está activa" }, { status: 400 });
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "FINISHED", endTime: new Date() },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[tablet/finish]", err);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
