import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/db";
import { isSlotAvailable, getBusinessSettings } from "@/lib/availability";
import { groupDiscountPct, splitGroupTotal } from "@/lib/group-discount";
import { MercadoPagoConfig, Preference } from "mercadopago";
import { rateLimit, clientIp } from "@/lib/rate-limit";
import { z } from "zod";

const schema = z.object({
  puestoIds: z.array(z.string().min(1)).min(2).max(20),
  duration: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  startTime: z.string().datetime(),
  customerEmail: z.string().email().optional(),
});

/**
 * POST /api/bookings/group — ONLINE group reservation.
 * Books several puestos at the same slot, applies the progressive group
 * discount and creates ONE MercadoPago preference for the combined total.
 * external_reference = "group-<groupId>" so the webhook confirms the whole group.
 */
export async function POST(req: NextRequest) {
  try {
    const rl = await rateLimit(`bookings:${clientIp(req)}`, 20, 10 * 60 * 1000);
    if (!rl.ok) {
      return NextResponse.json({ error: "Demasiadas reservas seguidas. Esperá un momento." }, { status: 429 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 });
    }
    const { duration, startTime: startStr, customerEmail } = parsed.data;
    const puestoIds = [...new Set(parsed.data.puestoIds)];
    if (puestoIds.length < 2) {
      return NextResponse.json({ error: "Elegí al menos 2 simuladores" }, { status: 400 });
    }

    const startTime = new Date(startStr);
    const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

    // No permitir turnos en el pasado ni fuera del horario del local (hora AR).
    if (startTime.getTime() < Date.now()) {
      return NextResponse.json({ error: "El horario debe ser futuro" }, { status: 400 });
    }
    const biz = await getBusinessSettings();
    const AR_OFFSET = 3 * 60 * 60 * 1000;
    const startHourAR = new Date(startTime.getTime() - AR_OFFSET).getUTCHours();
    const endAR = new Date(endTime.getTime() - AR_OFFSET);
    const endHourAR = endAR.getUTCHours() + endAR.getUTCMinutes() / 60;
    if (startHourAR < biz.openHour || endHourAR > biz.closeHour) {
      return NextResponse.json(
        { error: `El turno debe estar entre las ${biz.openHour} y las ${biz.closeHour} h.` },
        { status: 400 }
      );
    }

    const puestos = await prisma.puesto.findMany({ where: { id: { in: puestoIds }, active: true } });
    if (puestos.length !== puestoIds.length) {
      return NextResponse.json({ error: "Algún simulador no está disponible" }, { status: 404 });
    }

    const priceKey = `price${duration}` as "price30" | "price60" | "price90" | "price120";
    for (const p of puestos) {
      if (!(p[priceKey] ?? 0)) {
        return NextResponse.json({ error: "Precio no configurado para esta duración" }, { status: 400 });
      }
    }

    const baseTotal = puestos.reduce((s, p) => s + (p[priceKey] ?? 0), 0);
    const settings = await getBusinessSettings();
    const pct = groupDiscountPct(settings, puestos.length);
    const discountedTotal = Math.round(baseTotal * (1 - pct / 100));
    const shares = splitGroupTotal(discountedTotal, puestos.length);
    const groupId = crypto.randomUUID();

    // Lock every puesto (sorted, to avoid deadlocks), verify all slots are free,
    // then create the N PENDING bookings atomically.
    const ok = await prisma.$transaction(async (tx) => {
      for (const id of [...puestoIds].sort()) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${id}))`;
      }
      for (const p of puestos) {
        const free = await isSlotAvailable(p.id, startTime, endTime, undefined, tx);
        if (!free) return false;
      }
      for (let i = 0; i < puestos.length; i++) {
        await tx.booking.create({
          data: {
            puestoId: puestos[i].id,
            duration,
            price: shares[i],
            status: "PENDING",
            groupId,
            startTime,
            endTime,
            customerEmail: customerEmail ?? undefined,
          },
        });
      }
      return true;
    });

    if (!ok) {
      return NextResponse.json({ error: "Alguno de los horarios ya no está disponible" }, { status: 409 });
    }

    const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
    if (!accessToken) {
      return NextResponse.json({ error: "MercadoPago no configurado" }, { status: 500 });
    }
    const client = new MercadoPagoConfig({ accessToken, options: { timeout: 5000 } });
    const preference = new Preference(client);
    const baseUrl =
      process.env.NEXTAUTH_URL ??
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
    const isPublicUrl = baseUrl.startsWith("https://") && !baseUrl.includes("localhost");

    const pref = await preference.create({
      body: {
        items: [
          {
            id: groupId,
            title: `Grupo ${puestos.length} simuladores - ${duration} min`,
            quantity: 1,
            unit_price: discountedTotal / 100,
            currency_id: "ARS",
          },
        ],
        external_reference: `group-${groupId}`,
        ...(isPublicUrl && {
          notification_url: `${baseUrl}/api/webhooks/mercadopago`,
          auto_return: "approved",
        }),
        back_urls: {
          success: `${baseUrl}/reserva/confirmacion?groupId=${groupId}`,
          failure: `${baseUrl}/reserva?error=payment_failed`,
          pending: `${baseUrl}/reserva/confirmacion?groupId=${groupId}`,
        },
        metadata: { group_id: groupId },
      },
    });

    return NextResponse.json({
      groupId,
      initPoint: pref.init_point,
      sandboxInitPoint: pref.sandbox_init_point,
    });
  } catch (error) {
    console.error("[bookings/group] POST error:", error);
    return NextResponse.json({ error: "Error al crear la reserva grupal" }, { status: 500 });
  }
}
