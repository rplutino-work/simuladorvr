import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/cancelar?token=xxx
 * Returns booking info + cancellation eligibility for the self-service cancel page.
 * No auth required — token acts as the secret.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { cancelToken: token },
    include: { puesto: true, payments: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada o enlace inválido" }, { status: 404 });
  }

  const settings = await prisma.businessSettings.findFirst();

  // Determine if cancellation is allowed
  let canCancel = true;
  let reason: string | null = null;

  if (booking.status === "CANCELLED") {
    canCancel = false;
    reason = "Esta reserva ya fue cancelada";
  } else if (booking.status === "ACTIVE") {
    canCancel = false;
    reason = "La sesión ya está en curso";
  } else if (booking.status === "COMPLETED") {
    canCancel = false;
    reason = "La sesión ya fue completada";
  } else if (!settings?.allowCancel) {
    canCancel = false;
    reason = "Las cancelaciones no están disponibles en este momento";
  } else if (booking.startTime) {
    // Check cancelLimitHours
    const limitHours = settings?.cancelLimitHours ?? 0;
    const now = new Date();
    const msUntilStart = booking.startTime.getTime() - now.getTime();
    const hoursUntilStart = msUntilStart / (1000 * 60 * 60);
    if (hoursUntilStart < limitHours) {
      canCancel = false;
      reason =
        limitHours > 0
          ? `Solo se puede cancelar con al menos ${limitHours} hora${limitHours !== 1 ? "s" : ""} de anticipación`
          : "El turno ya pasó o está próximo a iniciar";
    }
  }

  // Detect if refund is possible (payment is not manual)
  const payment = booking.payments?.[0];
  const isManualPayment = !payment || payment.mpPaymentId.startsWith("manual-");
  const effectiveCancelMode =
    isManualPayment ? "MANUAL" : (settings?.cancelMode ?? "MANUAL");

  return NextResponse.json({
    booking: {
      id: booking.id,
      code: booking.code,
      status: booking.status,
      startTime: booking.startTime,
      duration: booking.duration,
      puesto: booking.puesto.name,
      price: booking.price,
      customerName: booking.customerName,
    },
    canCancel,
    reason,
    cancelMode: effectiveCancelMode,
    contactPhone: settings?.contactPhone ?? null,
    cancelLimitHours: settings?.cancelLimitHours ?? 0,
  });
}

/**
 * POST /api/cancelar
 * Body: { token: string }
 * Cancels the booking. For AUTOMATIC mode, triggers a MercadoPago refund.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const token = body?.token as string | undefined;

  if (!token) {
    return NextResponse.json({ error: "Token requerido" }, { status: 400 });
  }

  const booking = await prisma.booking.findUnique({
    where: { cancelToken: token },
    include: { puesto: true, payments: true },
  });

  if (!booking) {
    return NextResponse.json({ error: "Reserva no encontrada o enlace inválido" }, { status: 404 });
  }

  if (booking.status === "CANCELLED") {
    return NextResponse.json({ error: "Esta reserva ya fue cancelada" }, { status: 400 });
  }
  if (!["PENDING", "PAID"].includes(booking.status)) {
    return NextResponse.json(
      { error: "No se puede cancelar en el estado actual" },
      { status: 400 }
    );
  }

  const settings = await prisma.businessSettings.findFirst();

  if (!settings?.allowCancel) {
    return NextResponse.json(
      { error: "Las cancelaciones no están disponibles" },
      { status: 403 }
    );
  }

  // Check time limit
  if (booking.startTime) {
    const limitHours = settings.cancelLimitHours ?? 0;
    const hoursUntilStart =
      (booking.startTime.getTime() - Date.now()) / (1000 * 60 * 60);
    if (hoursUntilStart < limitHours) {
      return NextResponse.json(
        {
          error: `Solo se puede cancelar con al menos ${limitHours} hora${limitHours !== 1 ? "s" : ""} de anticipación`,
        },
        { status: 400 }
      );
    }
  }

  // Detect payment type
  const payment = booking.payments?.[0];
  const isManualPayment = !payment || payment.mpPaymentId.startsWith("manual-");
  const effectiveCancelMode =
    isManualPayment ? "MANUAL" : (settings?.cancelMode ?? "MANUAL");

  // Cancel the booking
  await prisma.booking.update({
    where: { id: booking.id },
    data: { status: "CANCELLED" },
  });

  if (effectiveCancelMode === "AUTOMATIC" && payment && !isManualPayment) {
    // Attempt MercadoPago refund
    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({
        ok: true,
        needsContact: true,
        reason: "Reembolso automático no disponible",
        contactPhone: settings?.contactPhone ?? null,
      });
    }

    try {
      const mpRes = await fetch(
        `https://api.mercadopago.com/v1/payments/${payment.mpPaymentId}/refunds`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (!mpRes.ok) {
        const errBody = await mpRes.json().catch(() => ({}));
        console.error("[cancelar] MP refund error:", errBody);
        return NextResponse.json({
          ok: true,
          refunded: false,
          needsContact: true,
          reason: "No se pudo procesar el reembolso automático. Contactate con nosotros.",
          contactPhone: settings?.contactPhone ?? null,
        });
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: { status: "refunded" },
      });

      return NextResponse.json({ ok: true, refunded: true, needsContact: false });
    } catch (err) {
      console.error("[cancelar] MP refund exception:", err);
      return NextResponse.json({
        ok: true,
        refunded: false,
        needsContact: true,
        reason: "Error al procesar el reembolso. Contactate con nosotros.",
        contactPhone: settings?.contactPhone ?? null,
      });
    }
  }

  // MANUAL mode
  return NextResponse.json({
    ok: true,
    refunded: false,
    needsContact: true,
    contactPhone: settings?.contactPhone ?? null,
  });
}
