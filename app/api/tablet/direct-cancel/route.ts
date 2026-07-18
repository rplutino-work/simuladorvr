import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MercadoPagoConfig, Payment } from "mercadopago";

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

    // Race guard: the customer may have paid in the last seconds while the
    // webhook is still in flight. Ask MercadoPago directly — if there's an
    // approved payment for this booking, DON'T cancel (that would charge them
    // with no session). Leave it PENDING for the webhook/reconciler to activate.
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (accessToken) {
      try {
        const paymentApi = new Payment(new MercadoPagoConfig({ accessToken }));
        const search = await paymentApi.search({
          options: { external_reference: `direct-${bookingId}` },
        });
        const approved = (search.results ?? []).some((p) => p.status === "approved");
        if (approved) {
          return NextResponse.json({ ok: true, paid: true });
        }
      } catch (e) {
        console.error("[direct-cancel] MP check failed:", e);
        // If we can't verify, fall through and cancel (timeout must free the slot).
      }
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
