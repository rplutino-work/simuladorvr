import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { isSlotAvailable } from "@/lib/availability";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { withPuestoLock } from "@/lib/booking-lock";

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
    // Límite generoso: es un flujo de PAGO (un cliente que quiere pagar no debe
    // quedar bloqueado). El problema real de los QR trabados se resuelve abajo
    // cancelando el QR abandonado, no acá.
    const rl = await rateLimit(`direct:${clientIp(req)}:${puestoId}`, 40, 5 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos. Esperá un momento." },
        { status: 429 }
      );
    }
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

    // Availability check + create under a per-puesto advisory lock so two
    // people can't buy the same puesto/slot at the same time.
    const booking = await withPuestoLock(puestoId, async (tx) => {
      // Cancelar el QR ANTERIOR abandonado de este puesto. Un booking PENDING de
      // compra directa (sin email, sin código, sin grupo = generado por un QR que
      // el cliente no pagó) ocupa el slot y hace que el PRÓXIMO QR dé 409 → el
      // cliente reintenta, se traba, y termina en "demasiados intentos". Al pedir
      // un QR nuevo, el viejo ya no sirve: lo cancelamos y liberamos el puesto.
      // (No toca reservas online: esas tienen customerEmail.)
      await tx.booking.updateMany({
        where: {
          puestoId,
          status: "PENDING",
          code: null,
          groupId: null,
          customerEmail: null,
        },
        data: { status: "CANCELLED" },
      });
      const available = await isSlotAvailable(puestoId, now, endTime, undefined, tx);
      if (!available) return null;
      return tx.booking.create({
        data: {
          puestoId,
          duration: actualMinutes,
          price,
          status: "PENDING",
          startTime: now,
          endTime,
        },
      });
    });
    if (!booking) {
      // Si sigue sin estar disponible tras limpiar los QR viejos, es porque hay
      // una sesión en curso o una reserva próxima real → mensaje claro (sin
      // invitar a reintentar en loop).
      return NextResponse.json(
        { error: "El simulador está ocupado en este momento. Esperá a que se libere." },
        { status: 409 }
      );
    }

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
