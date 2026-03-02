import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MercadoPagoConfig, Preference } from "mercadopago";

/**
 * POST /api/tablet/extend
 * Body: { bookingId: string, additionalMinutes: 30 | 60 | 120, puestoId: string }
 *
 * Creates a MercadoPago payment preference for a session extension.
 * external_reference = "ext-{bookingId}-{additionalMinutes}"
 * When the webhook confirms payment, the booking's endTime is extended.
 */
export async function POST(req: NextRequest) {
  try {
    const { bookingId, additionalMinutes, puestoId } = await req.json();

    if (!bookingId || !additionalMinutes || !puestoId) {
      return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
    }

    const booking = await prisma.booking.findFirst({
      where: { id: bookingId, puestoId, status: "ACTIVE" },
      include: { puesto: true },
    });

    if (!booking) {
      return NextResponse.json(
        { error: "Sesión activa no encontrada" },
        { status: 404 }
      );
    }

    // Calculate extension price using the puesto's configured price
    const priceKey =
      additionalMinutes === 30
        ? "price30"
        : additionalMinutes === 60
        ? "price60"
        : "price120";
    const priceArs = booking.puesto[priceKey] / 100;

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ error: "MercadoPago no configurado" }, { status: 500 });
    }

    const client = new MercadoPagoConfig({ accessToken });
    const preferenceApi = new Preference(client);

    const baseUrl = process.env.NEXTAUTH_URL ?? "";
    const externalRef = `ext-${bookingId}-${additionalMinutes}`;

    const preference = await preferenceApi.create({
      body: {
        items: [
          {
            id: externalRef,
            title: `Extensión +${additionalMinutes} min — ${booking.puesto.name}`,
            quantity: 1,
            currency_id: "ARS",
            unit_price: priceArs,
          },
        ],
        external_reference: externalRef,
        ...(baseUrl.startsWith("https://") && {
          notification_url: `${baseUrl}/api/webhooks/mercadopago`,
        }),
        auto_return: "approved" as const,
        back_urls: {
          success: `${baseUrl}/tablet/${puestoId}`,
          failure: `${baseUrl}/tablet/${puestoId}`,
          pending: `${baseUrl}/tablet/${puestoId}`,
        },
      },
    });

    return NextResponse.json({
      initPoint: preference.init_point,
      sandboxInitPoint: preference.sandbox_init_point,
      externalRef,
      amount: priceArs,
      additionalMinutes,
    });
  } catch (err) {
    console.error("[tablet/extend]", err);
    return NextResponse.json({ error: "Error al crear el pago" }, { status: 500 });
  }
}
