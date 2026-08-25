import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateBookingCode } from "@/lib/code-generator";
import { isSlotAvailable, getBusinessSettings } from "@/lib/availability";
import { groupDiscountPct, splitGroupTotal } from "@/lib/group-discount";
import { z } from "zod";

const createSchema = z.object({
  puestoIds: z.array(z.string().min(1)).min(2).max(20),
  duration: z.union([z.literal(30), z.literal(60), z.literal(90), z.literal(120)]),
  startTime: z.string().datetime(),
  customerName: z.string().max(100).optional(),
  customerEmail: z.string().email().optional(),
  notes: z.string().max(500).optional(),
});

/**
 * POST /api/admin/bookings/group — walk-in GROUP booking.
 * Books several puestos at the same slot, applies the progressive group
 * discount, splits the total across the bookings (so metrics stay accurate),
 * and issues ONE shared group code. Created as PAID (cash). Operator/admin.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = createSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.errors[0]?.message ?? "Datos inválidos" }, { status: 400 });
  }
  const { puestoIds, duration, startTime: startStr, customerName, customerEmail, notes } = parsed.data;

  const uniqueIds = [...new Set(puestoIds)];
  if (uniqueIds.length !== puestoIds.length) {
    return NextResponse.json({ error: "Hay puestos repetidos en el grupo" }, { status: 400 });
  }
  const startTime = new Date(startStr);
  const endTime = new Date(startTime.getTime() + duration * 60 * 1000);

  const puestos = await prisma.puesto.findMany({ where: { id: { in: uniqueIds } } });
  if (puestos.length !== uniqueIds.length) {
    return NextResponse.json({ error: "Algún puesto no existe" }, { status: 404 });
  }

  // Availability for every puesto at the same slot.
  const priceKey = `price${duration}` as "price30" | "price60" | "price90" | "price120";
  for (const p of puestos) {
    const price = p[priceKey] ?? 0;
    if (!price || price <= 0) {
      return NextResponse.json({ error: `Precio no configurado (${duration} min) en ${p.name}` }, { status: 400 });
    }
    const free = await isSlotAvailable(p.id, startTime, endTime);
    if (!free) {
      return NextResponse.json({ error: `${p.name} no está libre en ese horario` }, { status: 409 });
    }
  }

  // Base total = sum of individual prices; apply the group discount.
  const baseTotal = puestos.reduce((s, p) => s + (p[priceKey] ?? 0), 0);
  const settings = await getBusinessSettings();
  const pct = groupDiscountPct(settings, puestos.length);
  const discountedTotal = Math.round(baseTotal * (1 - pct / 100));
  const shares = splitGroupTotal(discountedTotal, puestos.length);

  // One shared group code (kept reasonably unique among live groups).
  let groupCode = generateBookingCode();
  let clash = await prisma.booking.findFirst({ where: { groupCode, status: { in: ["PENDING", "PAID", "ACTIVE"] } } });
  while (clash) {
    groupCode = generateBookingCode();
    clash = await prisma.booking.findFirst({ where: { groupCode, status: { in: ["PENDING", "PAID", "ACTIVE"] } } });
  }
  const groupId = crypto.randomUUID();
  const tag = notes ? `[Grupo] ${notes}` : "[Grupo walk-in]";

  const created = await prisma.$transaction(async (tx) => {
    const rows = [];
    for (let i = 0; i < puestos.length; i++) {
      const b = await tx.booking.create({
        data: {
          puestoId: puestos[i].id,
          duration,
          price: shares[i],
          status: "PAID",
          groupId,
          groupCode,
          startTime,
          endTime,
          customerName: customerName ?? undefined,
          customerEmail: customerEmail ?? undefined,
          notes: tag,
        },
      });
      await tx.payment.create({
        data: { bookingId: b.id, mpPaymentId: `manual-${b.id}`, amount: shares[i], status: "approved" },
      });
      rows.push(b);
    }
    return rows;
  });

  return NextResponse.json(
    {
      groupId,
      groupCode,
      count: created.length,
      baseTotal,
      discountPct: pct,
      total: discountedTotal,
      puestos: puestos.map((p) => p.name),
    },
    { status: 201 }
  );
}

const actionSchema = z.object({
  groupId: z.string().min(1),
  action: z.enum(["start", "finish", "cancel"]),
});

/**
 * PATCH /api/admin/bookings/group — start / finish / cancel a whole group.
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = actionSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: "Datos inválidos" }, { status: 400 });
  const { groupId, action } = parsed.data;

  const bookings = await prisma.booking.findMany({ where: { groupId } });
  if (!bookings.length) return NextResponse.json({ error: "Grupo no encontrado" }, { status: 404 });

  if (action === "start") {
    const now = new Date();
    await prisma.$transaction(
      bookings.map((b) =>
        prisma.booking.update({
          where: { id: b.id },
          data: { status: "ACTIVE", startTime: now, endTime: new Date(now.getTime() + b.duration * 60 * 1000) },
        })
      )
    );
  } else {
    const status = action === "finish" ? "FINISHED" : "CANCELLED";
    await prisma.booking.updateMany({ where: { groupId }, data: { status } });
  }

  return NextResponse.json({ ok: true, groupId, action, count: bookings.length });
}
