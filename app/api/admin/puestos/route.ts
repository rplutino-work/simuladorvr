import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { z } from "zod";

const createPuestoSchema = z.object({
  name: z.string().min(1),
  price30: z.number().int().min(0),
  price60: z.number().int().min(0),
  price120: z.number().int().min(0),
});

/**
 * GET /api/admin/puestos - List all (admin only)
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const puestos = await prisma.puesto.findMany({
    orderBy: { name: "asc" },
  });
  return NextResponse.json(puestos);
}

/**
 * POST /api/admin/puestos - Create (admin only)
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.role || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const body = await req.json();
  const parsed = createPuestoSchema.safeParse({
    ...body,
    price30: Number(body.price30 ?? 0) * 100,
    price60: Number(body.price60 ?? 0) * 100,
    price120: Number(body.price120 ?? 0) * 100,
  });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Datos inválidos" },
      { status: 400 }
    );
  }
  const puesto = await prisma.puesto.create({ data: parsed.data });
  return NextResponse.json(puesto);
}
