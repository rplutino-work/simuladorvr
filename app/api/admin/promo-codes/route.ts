import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { parsePromoInput } from "@/lib/promo";

/** Solo ADMIN administra códigos promocionales. */
async function requireAdmin() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return null;
}

// GET /api/admin/promo-codes — lista todos los códigos (con usos).
export async function GET() {
  const gate = await requireAdmin();
  if (gate) return gate;
  const codes = await prisma.promoCode.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json({ codes });
}

// POST /api/admin/promo-codes — crea un código.
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const parsed = parsePromoInput(body);
  if ("error" in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 });
  try {
    const code = await prisma.promoCode.create({ data: parsed.data });
    return NextResponse.json({ code });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2002")
      return NextResponse.json({ error: "Ya existe un código con ese texto." }, { status: 409 });
    console.error("[promo-codes POST]", e);
    return NextResponse.json({ error: "Error al crear el código." }, { status: 500 });
  }
}
