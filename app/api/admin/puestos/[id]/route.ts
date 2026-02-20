import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const updatePuestoSchema = z.object({
  name: z.string().min(1).optional(),
  active: z.boolean().optional(),
  price30: z.number().int().min(0).optional(),
  price60: z.number().int().min(0).optional(),
  price120: z.number().int().min(0).optional(),
});

/**
 * PATCH /api/admin/puestos/[id] - Update (admin only)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = { ...body };
  if (typeof body.price30 === "number") data.price30 = body.price30 * 100;
  if (typeof body.price60 === "number") data.price60 = body.price60 * 100;
  if (typeof body.price120 === "number") data.price120 = body.price120 * 100;
  const parsed = updatePuestoSchema.safeParse(data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }
  const puesto = await prisma.puesto.update({
    where: { id },
    data: parsed.data,
  });
  return NextResponse.json(puesto);
}

/**
 * DELETE /api/admin/puestos/[id] - Soft delete via active=false or hard delete
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await params;
  await prisma.puesto.update({ where: { id }, data: { active: false } });
  return NextResponse.json({ ok: true });
}
