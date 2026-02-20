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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thirtyDaysAgo = new Date(today);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

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
        createdAt: { gte: today },
      },
      _sum: { amount: true },
    }),
    prisma.payment.aggregate({
      where: {
        status: "approved",
        createdAt: { gte: thirtyDaysAgo },
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

  const hourlyHeatmap = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: hourlyData.filter((b) => b.startTime && new Date(b.startTime).getHours() === h).length,
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
