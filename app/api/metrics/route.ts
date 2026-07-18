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

  const [
    activeBookingsCount,
    revenueToday,
    revenueMonth,
    bookingsByPuesto,
    bookingsByDuration,
    hourlyData,
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

  return NextResponse.json({
    activeBookingsCount,
    revenueToday: (revenueToday._sum.amount ?? 0) / 100,
    revenueMonth: (revenueMonth._sum.amount ?? 0) / 100,
    mostUsedPuesto: usagePerPuesto.sort((a, b) => b.count - a.count)[0] ?? null,
    usagePerPuesto,
    bookingsByDuration: durationCounts,
    hourlyHeatmap,
  });
}
