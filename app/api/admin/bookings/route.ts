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
  // type: real (pagos, sin pruebas — DEFAULT) | trial | walkin | mp | all
  const type = searchParams.get("type") || "real";
  const from = searchParams.get("from"); // ISO datetime (inclusive)
  const to = searchParams.get("to"); // ISO datetime (inclusive)
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const pageSize = Math.min(
    200,
    Math.max(1, parseInt(searchParams.get("pageSize") ?? "50", 10) || 50)
  );

  // Sesiones gratis (códigos de cortesía/promo) — se identifican por la nota. Los
  // códigos de la tabla PromoCode dejan "[Promo …]"; "Prueba"/"Uso libre" son las
  // notas legacy de los viejos códigos cableados.
  const TRIAL_OR: Prisma.BookingWhereInput[] = [
    { notes: { startsWith: "[Promo " } },
    { notes: { contains: "Prueba" } },
    { notes: { contains: "Uso libre" } },
  ];
  const WALKIN: Prisma.BookingWhereInput = { notes: { contains: "Walk-in" } };

  // Base filter shared by la lista y los contadores (search + puesto + fecha +
  // tipo, pero NO status — las tarjetas necesitan el total de cada estado dentro
  // de la vista actual).
  const base: Prisma.BookingWhereInput = {};
  const and: Prisma.BookingWhereInput[] = [];
  if (puestoId) base.puestoId = puestoId;
  if (q) {
    base.OR = [
      { code: { contains: q, mode: "insensitive" } },
      { customerName: { contains: q, mode: "insensitive" } },
      { customerEmail: { contains: q, mode: "insensitive" } },
      { id: { equals: q } },
    ];
  }
  if (from || to) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (from) createdAt.gte = new Date(from);
    if (to) createdAt.lte = new Date(to);
    base.createdAt = createdAt;
  }
  // Filtro por TIPO de reserva. OJO: `notes` puede ser NULL (online/QR sin nota),
  // y en SQL `NOT (notes LIKE ...)` sobre NULL da NULL → excluiría esas filas. Por
  // eso "no contiene X" se expresa como (notes IS NULL) OR (notes NOT LIKE %X%).
  const notContains = (s: string): Prisma.BookingWhereInput => ({
    OR: [{ notes: null }, { notes: { not: { contains: s } } }],
  });
  // QR ABANDONADO: compra directa (sin código/email/grupo) que quedó
  // cancelada/expirada SIN pago → el cliente generó el QR y no pagó. No es una
  // cancelación real; se oculta del default y se ve con type=qr.
  const ABANDONED_QR: Prisma.BookingWhereInput = {
    code: null,
    customerEmail: null,
    groupId: null,
    status: { in: ["CANCELLED", "EXPIRED"] },
    payment: { is: null },
  };
  if (type === "trial") and.push({ OR: TRIAL_OR });
  else if (type === "walkin") and.push(WALKIN);
  else if (type === "qr") and.push(ABANDONED_QR);
  else if (type === "mp")
    and.push(notContains("[Promo "), notContains("Prueba"), notContains("Uso libre"), notContains("Walk-in"), { NOT: ABANDONED_QR });
  else if (type === "real")
    and.push(notContains("[Promo "), notContains("Prueba"), notContains("Uso libre"), { NOT: ABANDONED_QR }); // default: sin cortesías/promos ni QR sin pagar
  // type === "all" → sin filtro de tipo
  if (and.length) base.AND = and;

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
