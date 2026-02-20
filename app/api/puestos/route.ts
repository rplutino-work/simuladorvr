import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/puestos
 * Returns active puestos for public booking
 */
export async function GET() {
  const puestos = await prisma.puesto.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(puestos);
}
