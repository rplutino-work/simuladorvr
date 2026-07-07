import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

/**
 * GET /api/admin/devices
 *
 * Per-puesto device status for the admin dashboard. Returns raw timestamps so
 * the client can compute online/offline live and re-render each second without
 * refetching. A puesto is included only if it's active (kiosks run on those).
 *
 * TV note: while a session is ACTIVE the TV WebView is on the PlayStation HDMI
 * input and its heartbeat goes silent — that's expected, not offline. We flag
 * `hasActiveSession` so the client renders "En sesión (HDMI)" instead of a red
 * offline badge.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [puestos, activeBookings] = await Promise.all([
    prisma.puesto.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      include: { heartbeats: true },
    }),
    prisma.booking.findMany({
      where: { status: "ACTIVE" },
      select: { puestoId: true, endTime: true, customerName: true, duration: true },
    }),
  ]);

  const sessionByPuesto = new Map(activeBookings.map((b) => [b.puestoId, b]));

  const devices = puestos.map((p) => {
    const tablet = p.heartbeats.find((h) => h.deviceType === "TABLET");
    const tv = p.heartbeats.find((h) => h.deviceType === "TV");
    const activeSession = sessionByPuesto.get(p.id) ?? null;

    return {
      puestoId: p.id,
      puestoName: p.name,
      hasActiveSession: !!activeSession,
      sessionEndTime: activeSession?.endTime ?? null,
      tabletLastSeen: tablet?.lastSeenAt ?? null,
      tvLastSeen: tv?.lastSeenAt ?? null,
    };
  });

  return NextResponse.json({ devices, now: new Date().toISOString() });
}
