import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createBookingSchema } from "@/lib/validations/booking";
import { isSlotAvailable } from "@/lib/availability";
import { MercadoPagoConfig, Preference } from "mercadopago";

/**
 * POST /api/bookings
 * Create booking with startTime/endTime and MercadoPago preference
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.errors[0]?.message ?? "Datos inválidos" },
        { status: 400 }
      );
    }

    const { puestoId, duration, startTime: startTimeStr, customerEmail } = parsed.data;
    const startTime = new Date(startTimeStr);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    const puesto = await prisma.puesto.findUnique({
      where: { id: puestoId, active: true },
    });
    if (!puesto) {
      return NextResponse.json(
        { error: "Puesto no disponible" },
        { status: 404 }
      );
    }

    const available = await isSlotAvailable(puestoId, startTime, endTime);
    if (!available) {
      return NextResponse.json(
        { error: "El horario ya no está disponible" },
        { status: 409 }
      );
    }

    const priceKey = `price${duration}` as "price30" | "price60" | "price120";
    const price = puesto[priceKey];
    if (!price || price <= 0) {
      return NextResponse.json(
        { error: "Precio no configurado para esta duración" },
        { status: 400 }
      );
    }

    const booking = await prisma.booking.create({
      data: {
        puestoId,
        duration,
        price,
        status: "PENDING",
        startTime,
        endTime,
        customerEmail: customerEmail ?? undefined,
      },
      include: { puesto: true },
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

    // notification_url and auto_return require a publicly accessible HTTPS URL.
    // On localhost MercadoPago cannot reach them, so we skip them.
    const isPublicUrl = baseUrl.startsWith("https://") && !baseUrl.includes("localhost");

    const preferenceResult = await preference.create({
      body: {
        items: [
          {
            id: booking.id,
            title: `${puesto.name} - ${duration} min`,
            quantity: 1,
            unit_price: price / 100,
            currency_id: "ARS",
          },
        ],
        external_reference: booking.id,
        ...(isPublicUrl && {
          notification_url: `${baseUrl}/api/webhooks/mercadopago`,
          auto_return: "approved",
        }),
        back_urls: {
          success: `${baseUrl}/reserva/confirmacion?bookingId=${booking.id}`,
          failure: `${baseUrl}/reserva?error=payment_failed`,
          pending: `${baseUrl}/reserva/confirmacion?bookingId=${booking.id}`,
        },
        metadata: { booking_id: booking.id },
      },
    });

    return NextResponse.json({
      bookingId: booking.id,
      initPoint: preferenceResult.init_point,
      sandboxInitPoint: preferenceResult.sandbox_init_point,
    });
  } catch (error) {
    console.error("[bookings] POST error:", error);
    return NextResponse.json(
      { error: "Error al crear la reserva" },
      { status: 500 }
    );
  }
}
