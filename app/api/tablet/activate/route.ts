import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/tablet/activate
 * Body: { code: string, puestoId: string }
 *
 * Validates a booking code for a given puesto and starts the session.
 * - Finds PAID booking matching code + puestoId
 * - Sets status = ACTIVE, recalculates endTime from now
 */
export async function POST(req: NextRequest) {
  try {
    const { code, puestoId } = await req.json();

    if (!code || !puestoId) {
      return NextResponse.json({ error: "Código y puesto requeridos" }, { status: 400 });
    }

    const normalizedCode = String(code).toUpperCase().trim();

    const booking = await prisma.booking.findFirst({
      where: {
        code: normalizedCode,
        puestoId,
      },
      include: { puesto: true },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Código inválido. Verificá que el código sea correcto y que estés en el simulador correcto." },
        { status: 404 }
      );
    }

    if (booking.status === "CANCELLED") {
      return NextResponse.json(
        { error: "Esta reserva fue cancelada." },
        { status: 400 }
      );
    }
    if (booking.status === "EXPIRED") {
      return NextResponse.json(
        { error: "Esta reserva venció. Realizá una nueva reserva." },
        { status: 400 }
      );
    }
    if (booking.status === "FINISHED") {
      return NextResponse.json(
        { error: "Esta sesión ya fue completada." },
        { status: 400 }
      );
    }
    if (booking.status === "ACTIVE") {
      // Session already running — return current session data so tablet can resume display
      return NextResponse.json({
        bookingId: booking.id,
        code: booking.code,
        customerName: booking.customerName,
        endTime: booking.endTime,
        duration: booking.duration,
        puestoName: booking.puesto.name,
        resumed: true,
      });
    }
    if (booking.status !== "PAID") {
      return NextResponse.json(
        { error: "Esta reserva no está confirmada. Completá el pago primero." },
        { status: 400 }
      );
    }

    // Activate: recalculate endTime from current moment so user gets their full time
    const now = new Date();
    const endTime = new Date(now.getTime() + booking.duration * 60 * 1000);

    await prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: "ACTIVE",
        startTime: now,
        endTime,
      },
    });

    return NextResponse.json({
      bookingId: booking.id,
      code: booking.code,
      customerName: booking.customerName,
      endTime: endTime.toISOString(),
      duration: booking.duration,
      puestoName: booking.puesto.name,
      resumed: false,
    });
  } catch (err) {
    console.error("[tablet/activate]", err);
    return NextResponse.json({ error: "Error interno. Intentá de nuevo." }, { status: 500 });
  }
}
