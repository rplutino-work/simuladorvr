import { NextRequest, NextResponse } from "next/server";
import { updateTag } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/availability";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const updateSettingsSchema = z.object({
  openHour: z.number().int().min(0).max(23).optional(),
  closeHour: z.number().int().min(0).max(24).optional(),
  slotInterval: z.number().int().min(5).max(60).optional(),
  allowCancel: z.boolean().optional(),
  allowReschedule: z.boolean().optional(),
  cancelLimitHours: z.number().int().min(0).optional(),
  negativeMarginMinutes: z.number().int().min(0).optional(),
  emailEnabled: z.boolean().optional(),
  emailFrom: z.string().max(200).nullable().optional(),
  cancelMode: z.enum(["MANUAL", "AUTOMATIC"]).optional(),
  contactPhone: z.string().max(20).nullable().optional(),
  // Cooldown de la prueba gratis (código 8888), en minutos. 0 = desactivado.
  trialCooldownMin: z.number().int().min(0).max(240).optional(),
  // Group discount
  groupDiscountEnabled: z.boolean().optional(),
  groupDiscountTiers: z.record(z.string(), z.number().min(0).max(100)).nullable().optional(),
  groupDiscountFrom: z.string().datetime().nullable().optional(),
  groupDiscountTo: z.string().datetime().nullable().optional(),
});

/**
 * GET /api/admin/settings - Get business settings (admin only)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const settings = await getBusinessSettings();
  return NextResponse.json(settings);
}

/**
 * PATCH /api/admin/settings - Update business settings (admin only)
 */
export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = updateSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }
  let settings = await prisma.businessSettings.findFirst();
  if (!settings) {
    settings = await prisma.businessSettings.create({
      data: {
        openHour: 10,
        closeHour: 20,
        slotInterval: 15,
        allowCancel: true,
        allowReschedule: true,
        cancelLimitHours: 24,
        negativeMarginMinutes: 0,
        emailEnabled: true,
      },
    });
  }

  // Guard against an inverted schedule: with closeHour <= openHour every
  // "withinSchedule" check is false, which silently turns off every TV,
  // blocks direct purchases and hides all slots. Validate against the merged
  // (post-update) state so partial patches are covered too.
  const effOpen = parsed.data.openHour ?? settings.openHour;
  const effClose = parsed.data.closeHour ?? settings.closeHour;
  if (effClose <= effOpen) {
    return NextResponse.json(
      { error: "La hora de cierre debe ser mayor a la de apertura" },
      { status: 400 }
    );
  }

  // Split out the fields that need coercion (dates → Date, Json null handling).
  const { groupDiscountFrom, groupDiscountTo, groupDiscountTiers, ...rest } = parsed.data;
  const updateData: Prisma.BusinessSettingsUpdateInput = { ...rest };
  if (groupDiscountFrom !== undefined)
    updateData.groupDiscountFrom = groupDiscountFrom ? new Date(groupDiscountFrom) : null;
  if (groupDiscountTo !== undefined)
    updateData.groupDiscountTo = groupDiscountTo ? new Date(groupDiscountTo) : null;
  if (groupDiscountTiers !== undefined)
    updateData.groupDiscountTiers = groupDiscountTiers === null ? Prisma.JsonNull : groupDiscountTiers;

  const updated = await prisma.businessSettings.update({
    where: { id: settings.id },
    data: updateData,
  });
  updateTag("settings"); // invalidar YA el cached reader que usan los kioscos
  return NextResponse.json(updated);
}
