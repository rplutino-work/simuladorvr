import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * GET /api/cron/expire-bookings
 * Marks PENDING bookings as EXPIRED if they are older than 30 minutes.
 * Call via Vercel Cron Job (vercel.json) or manually from admin.
 * Protected by CRON_SECRET env var.
 */
export async function GET(req: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoff = new Date(Date.now() - 30 * 60 * 1000); // 30 minutes ago

  const result = await prisma.booking.updateMany({
    where: {
      status: "PENDING",
      createdAt: { lt: cutoff },
    },
    data: { status: "EXPIRED" },
  });

  return NextResponse.json({
    ok: true,
    expired: result.count,
    cutoff: cutoff.toISOString(),
  });
}
