import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isSlotAvailable } from "@/lib/availability";
import { MercadoPagoConfig, Preference } from "mercadopago";

const TIERS = [30, 60, 120] as const;
const MIN_USABLE_MINUTES = 10;
const ROUND_STEP_CENTS = 1000; // $10 in cents — keep in sync with direct-options

function roundUpTo(n: number, step: number) {
  return Math.ceil(n / step) * step;
}

/**
 * POST /api/tablet/[puestoId]/direct-purchase
 * Body: { tier: 30 | 60 | 120, actualMinutes: number }
 *
 * Creates a PENDING booking starting *now* for the requested duration
 * and returns a MercadoPago checkout URL. When the payment is confirmed,
 * the webhook (external_reference "direct-{bookingId}") activates the
 * session automatically — no code entry required.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ puestoId: string }> }
) {
  try {
    const { puestoId } = await params;
    let body: { tier?: unknown; actualMinutes?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const tier = Number(body?.tier);
    const actualMinutes = Number(body?.actualMinutes);

    if (!TIERS.includes(tier as (typeof TIERS)[number])) {
      return NextResponse.json(
        { error: "Tier inválido (debe ser 30, 60 o 120)" },
        { status: 400 }
      );
    }
    if (
      !Number.isFinite(actualMinutes) ||
      actualMinutes < MIN_USABLE_MINUTES ||
      actualMinutes > tier
    ) {
      return NextResponse.json(
        { error: "Duración real inválida" },
        { status: 400 }
      );
    }

    const puesto = await prisma.puesto.findUnique({
      where: { id: puestoId, active: true },
    });
    if (!puesto) {
      return NextResponse.json(
        { error: "Puesto no disponible" },
        { status: 404 }
      );
    }

    const tierPriceKey = `price${tier}` as "price30" | "price60" | "price120";
    const fullPrice = puesto[tierPriceKey];
    if (!fullPrice || fullPrice <= 0) {
      return NextResponse.json(
        { error: "Precio no configurado para esta duración" },
        { status: 400 }
      );
    }

    // Recompute proportional price server-side so the client can't spoof it
    const rawPrice = Math.round(fullPrice * (actualMinutes / tier));
    const price = roundUpTo(rawPrice, ROUND_STEP_CENTS);

    const now = new Date();
    const endTime = new Date(now.getTime() + actualMinutes * 60 * 1000);

    // Final availability check — blocks double-booking if another customer
    // reserves the slot online in the moment between rendering the options
    // and clicking.
    const available = await isSlotAvailable(puestoId, now, endTime);
    if (!available) {
      return NextResponse.json(
        { error: "El puesto ya no está disponible. Volvé a intentar." },
        { status: 409 }
      );
    }

    const booking = await prisma.booking.create({
      data: {
        puestoId,
        duration: actualMinutes,
        price,
        status: "PENDING",
        startTime: now,
        endTime,
      },
    });

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json(
        { error: "MercadoPago no configurado" },
        { status: 500 }
      );
    }

    const client = new MercadoPagoConfig({
      accessToken,
      options: { timeout: 5000 },
    });
    const preference = new Preference(client);

    const baseUrl =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const isPublicUrl =
      baseUrl.startsWith("https://") && !baseUrl.includes("localhost");

    const externalRef = `direct-${booking.id}`;

    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            id: booking.id,
            title: `${puesto.name} - ${actualMinutes} min`,
            quantity: 1,
            unit_price: price / 100,
            currency_id: "ARS",
          },
        ],
        external_reference: externalRef,
        ...(isPublicUrl && {
          notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        }),
        back_urls: {
          success: `${baseUrl}/tablet/${puestoId}`,
          failure: `${baseUrl}/tablet/${puestoId}`,
          pending: `${baseUrl}/tablet/${puestoId}`,
        },
        metadata: { booking_id: booking.id, direct_tablet: true },
      },
    });

    return NextResponse.json({
      bookingId: booking.id,
      initPoint: preferenceResult.init_point,
      sandboxInitPoint: preferenceResult.sandbox_init_point,
    });
  } catch (err) {
    console.error("[tablet/direct-purchase]", err);
    return NextResponse.json(
      { error: "Error al crear la compra" },
      { status: 500 }
    );
  }
}
