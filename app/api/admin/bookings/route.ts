import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";

/**
 * GET /api/admin/bookings — list with filters, search and pagination.
 *
 * Query params:
 *   status   — exact BookingStatus filter
 *   puestoId — exact puesto filter
 *   q        — free-text search over code / name / email / id
 *   page     — 1-based page number (default 1)
 *   pageSize — rows per page (default 50, max 200)
 *
 * Returns { bookings, total, page, pageSize, counts } where `counts` is the
 * per-status totals matching the search+puesto filter (but NOT the status
 * filter) so the admin's summary cards stay accurate across pages.
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const puestoId = searchParams.get("puestoId");
  const q = searchParams.get("q")?.trim();
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50)
  );

  // Base filter shared by the list and the summary counts (search + puesto,
  // but not status — the cards need every status' total).
  const base: Prisma.BookingWhereInput = {};
  if (puestoId) base.puestoId = puestoId;
  if (q) {
    base.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { id: { equals: q } },
    ];
  }

  const listWhere: Prisma.BookingWhereInput = { ...base };
  if (status) listWhere.status = status as Prisma.BookingWhereInput["status"];

  const [bookings, total, grouped] = await Promise.all([
    prisma.booking.findMany({
      where: listWhere,
      include: { puesto: true, payment: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.booking.count({ where: listWhere }),
    prisma.booking.groupBy({
      by: ["status"],
      where: base,
      _count: { _all: true },
    }),
  ]);

  const counts: Record<string, number> = {};
  for (const g of grouped) counts[g.status] = g._count._all;

  return NextResponse.json({ bookings, total, page, pageSize, counts });
}
