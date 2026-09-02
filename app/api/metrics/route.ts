import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/metrics
 * Dashboard metrics - requires auth
 */
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  // Facturación = SOLO ADMIN. Este endpoint devuelve ingresos del día/mes y la
  // serie diaria de revenue; un OPERATOR no debe verlo.
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Solo un administrador" }, { status: 403 });
  }

  // All day/month boundaries are computed in Argentina time (UTC-3), not the
  // server's UTC — otherwise "hoy" would reset at 21:00 local (peak hours).
  const AR_OFFSET = 3 * 60 * 60 * 1000;
  const nowAR = new Date(Date.now() - AR_OFFSET);
  const startOfTodayUTC = new Date(
    Date.UTC(nowAR.getUTCFullYear(), nowAR.getUTCMonth(), nowAR.getUTCDate()) + AR_OFFSET
  );
  const startOfMonthUTC = new Date(
    Date.UTC(nowAR.getUTCFullYear(), nowAR.getUTCMonth(), 1) + AR_OFFSET
  );
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  // 14-day window for the trend chart (in AR time).
  const fourteenDaysAgoUTC = new Date(startOfTodayUTC.getTime() - 13 * 24 * 60 * 60 * 1000);

  // Pruebas/uso gratis: sesiones activadas con códigos de cortesía/promo (los de
  // la tabla PromoCode dejan la nota "[Promo CODE - Nmin]"; las notas legacy
  // "Prueba"/"Uso libre" son de los viejos códigos cableados). No generan pago,
  // así que no aparecen en ingresos — se identifican por la nota.
  const TRIAL_FILTER = {
    OR: [
      { notes: { startsWith: "[Promo " } },
      { notes: { contains: "Prueba" } },
      { notes: { contains: "Uso libre" } },
    ],
  };

  const [
    activeBookingsCount,
    revenueToday,
    revenueMonth,
    bookingsByPuesto,
    bookingsByDuration,
    hourlyData,
    recentPayments,
    statusGroups,
    trialsToday,
    trialsMonth,
    trialsRecent,
  ] = await Promise.all([
    prisma.booking.count({ where: { status: "ACTIVE" } }),
    prisma.payment.aggregate({
      where: {
        status: "approved",
        createdAt: { gte: startOfTodayUTC },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        status: "approved",
        createdAt: { gte: startOfMonthUTC },
      },
      _sum: { amount: true },
    }),
    prisma.booking.groupBy({
      by: ["puestoId"],
      where: { status: { in: ["PAID", "ACTIVE", "FINISHED"] } },
      _count: { id: true },
    }),
    prisma.booking.groupBy({
      by: ["duration"],
      where: { status: { in: ["PAID", "ACTIVE", "FINISHED"] } },
      _count: { id: true },
    }),
    prisma.booking.findMany({
      where: {
        status: { in: ["PAID", "ACTIVE", "FINISHED"] },
        startTime: { gte: thirtyDaysAgo },
      },
      select: { startTime: true },
    }),
    // Approved payments in the last 14 days for the daily revenue trend.
    prisma.payment.findMany({
      where: { status: "approved", createdAt: { gte: fourteenDaysAgoUTC } },
      select: { amount: true, createdAt: true },
    }),
    // Booking status distribution (all-time) for the donut.
    prisma.booking.groupBy({ by: ["status"], _count: { id: true } }),
    // Pruebas hoy / mes / últimos 14 días (por startTime = momento de activación).
    prisma.booking.count({ where: { ...TRIAL_FILTER, startTime: { gte: startOfTodayUTC } } }),
    prisma.booking.count({ where: { ...TRIAL_FILTER, startTime: { gte: startOfMonthUTC } } }),
    prisma.booking.findMany({
      where: { ...TRIAL_FILTER, startTime: { gte: fourteenDaysAgoUTC } },
      select: { startTime: true, notes: true },
    }),
  ]);

  const puestoNames = await prisma.puesto.findMany({
    select: { id: true, name: true },
  });
  const puestoMap = Object.fromEntries(puestoNames.map((p) => [p.id, p.name]));

  const usagePerPuesto = bookingsByPuesto.map((b) => ({
    puestoId: b.puestoId,
    name: puestoMap[b.puestoId] ?? "Desconocido",
    count: b._count.id,
  }));

  const durationCounts = bookingsByDuration.map((b) => ({
    duration: b.duration,
    count: b._count.id,
  }));

  // Bucket by Argentina local hour, not the server's UTC hour.
  const hourlyHeatmap = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourlyData.filter(
      (b) => b.startTime && new Date(b.startTime.getTime() - AR_OFFSET).getUTCHours() === h
    ).length,
  }));

  // Daily revenue + payment count for the last 14 days, keyed by AR calendar day.
  const dayKey = (d: Date) => {
    const ar = new Date(d.getTime() - AR_OFFSET);
    return `${ar.getUTCFullYear()}-${String(ar.getUTCMonth() + 1).padStart(2, "0")}-${String(ar.getUTCDate()).padStart(2, "0")}`;
  };
  const dailyMap = new Map<string, { revenue: number; count: number; trials: number }>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(startOfTodayUTC.getTime() - i * 24 * 60 * 60 * 1000);
    dailyMap.set(dayKey(d), { revenue: 0, count: 0, trials: 0 });
  }
  for (const p of recentPayments) {
    const k = dayKey(p.createdAt);
    const slot = dailyMap.get(k);
    if (slot) {
      slot.revenue += (p.amount ?? 0) / 100;
      slot.count += 1;
    }
  }
  for (const t of trialsRecent) {
    if (!t.startTime) continue;
    const slot = dailyMap.get(dayKey(t.startTime));
    if (slot) slot.trials += 1;
  }
  const dailySeries = Array.from(dailyMap.entries()).map(([date, v]) => ({
    date,
    revenue: v.revenue,
    count: v.count,
    trials: v.trials,
  }));

  // Desglose de pruebas por tipo (últimos 14 días), según la nota del código.
  const trialTypeOf = (notes: string | null) => {
    const n = notes ?? "";
    const m = n.match(/^\[Promo\s+(\S+)/); // "[Promo BR33 - 33min]" → BR33
    if (m) return `Código ${m[1]}`;
    if (n.includes("staff")) return "Staff (RRRR)";
    if (n.includes("Uso libre")) return "Uso libre (9999)";
    if (n.includes("Prueba")) return "Prueba gratis (8888)";
    return "Otra";
  };
  const trialTypeMap = new Map<string, number>();
  for (const t of trialsRecent) {
    const k = trialTypeOf(t.notes);
    trialTypeMap.set(k, (trialTypeMap.get(k) ?? 0) + 1);
  }
  const trialsByType = Array.from(trialTypeMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const statusBreakdown = statusGroups.map((g) => ({
    status: g.status,
    count: g._count.id,
  }));

  const totalBookings = statusBreakdown.reduce((s, g) => s + g.count, 0);

  return NextResponse.json({
    activeBookingsCount,
    revenueToday: (revenueToday._sum.amount ?? 0) / 100,
    revenueMonth: (revenueMonth._sum.amount ?? 0) / 100,
    totalBookings,
    mostUsedPuesto: usagePerPuesto.sort((a, b) => b.count - a.count)[0] ?? null,
    usagePerPuesto,
    bookingsByDuration: durationCounts,
    hourlyHeatmap,
    dailySeries,
    statusBreakdown,
    trialsToday,
    trialsMonth,
    trialsByType,
  });
}
