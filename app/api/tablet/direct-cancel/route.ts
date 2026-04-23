import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/tablet/direct-cancel
 * Body: { bookingId: string }
 *
 * Cancels a PENDING direct-purchase booking so the slot is freed.
 * If the booking already went through (PAID/ACTIVE/etc) we do not touch it —
 * that's handled by the normal cancellation flow.
 */
export async function POST(req: NextRequest) {
  try {
    const { bookingId } = await req.json();
    if (!bookingId) {
      return NextResponse.json(
        { error: "bookingId requerido" },
        { status: 400 }
      );
    }

    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true },
    });
    if (!booking) {
      return NextResponse.json({ ok: true, alreadyGone: true });
    }
    if (booking.status !== "PENDING") {
      // Already paid or otherwise progressed — nothing to do here.
      return NextResponse.json({ ok: true, status: booking.status });
    }

    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CANCELLED" },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[tablet/direct-cancel]", err);
    return NextResponse.json(
      { error: "Error al cancelar" },
      { status: 500 }
    );
  }
}
