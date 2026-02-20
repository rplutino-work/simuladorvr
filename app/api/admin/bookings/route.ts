import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/bookings - List with filters
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const puestoId = searchParams.get("puestoId");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (puestoId) where.puestoId = puestoId;

  const bookings = await prisma.booking.findMany({
    where,
    include: { puesto: true, payment: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json(bookings);
}
