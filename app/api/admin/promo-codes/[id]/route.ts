import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePromoInput } from "@/lib/promo";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

// PATCH /api/admin/promo-codes/[id] — edita un código. Atajo: {active:boolean}
// solo togglea activo (sin re-validar todo el resto).
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate) return gate;
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }

  // Toggle rápido de activo/inactivo.
  if (Object.keys(body).length === 1 && typeof body.active === "boolean") {
    try {
      const code = await prisma.promoCode.update({ where: { id }, data: { active: body.active } });
      return NextResponse.json({ code });
    } catch {
      return NextResponse.json({ error: "Código no encontrado." }, { status: 404 });
    }
  }

  const parsed = parsePromoInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  // parsePromoInput no incluye usedCount, así que editar nunca pisa los usos ya consumidos.
  try {
    const code = await prisma.promoCode.update({ where: { id }, data: parsed.data });
    return NextResponse.json({ code });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "Ya existe un código con ese texto." }, { status: 409 });
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2025")
      return NextResponse.json({ error: "Código no encontrado." }, { status: 404 });
    console.error("[promo-codes PATCH]", e);
    return NextResponse.json({ error: "Error al editar el código." }, { status: 500 });
  }
}

// DELETE /api/admin/promo-codes/[id]
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if (gate) return gate;
  const { id } = await params;
  try {
    await prisma.promoCode.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Código no encontrado." }, { status: 404 });
  }
}
