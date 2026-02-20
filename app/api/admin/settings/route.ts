import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/availability";
import { z } from "zod";

const updateSettingsSchema = z.object({
  openHour: z.number().int().min(0).max(23).optional(),
  closeHour: z.number().int().min(0).max(24).optional(),
  slotInterval: z.number().int().min(5).max(60).optional(),
  allowCancel: z.boolean().optional(),
  allowReschedule: z.boolean().optional(),
  cancelLimitHours: z.number().int().min(0).optional(),
  negativeMarginMinutes: z.number().int().min(0).optional(),
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
  const body = await req.json();
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
      },
    });
  }
  const updated = await prisma.businessSettings.update({
    where: { id: settings.id },
    data: parsed.data,
  });
  return NextResponse.json(updated);
}
