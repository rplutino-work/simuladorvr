import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/**
 * POST /api/devices/heartbeat
 *
 * Liveness ping from an unauthenticated kiosk device (tablet or TV WebView).
 * Upserts a single row per (puestoId, deviceType), refreshing lastSeenAt.
 * The admin reads these rows to show which devices are online/offline.
 *
 * Body: { puestoId: string, deviceType: "TABLET" | "TV" }
 */
export async function POST(req: NextRequest) {
  let body: { puestoId?: string; deviceType?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { puestoId, deviceType } = body;
  if (!puestoId || (deviceType !== "TABLET" && deviceType !== "TV")) {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Ignore pings for unknown puestos so a stale/misconfigured kiosk can't
  // create orphan rows (there is no FK-less insert path here).
  const puesto = await prisma.puesto.findUnique({
    where: { id: puestoId },
    select: { id: true },
  });
  if (!puesto) {
    return NextResponse.json({ error: "Unknown puesto" }, { status: 404 });
  }

  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  await prisma.deviceHeartbeat.upsert({
    where: { puestoId_deviceType: { puestoId, deviceType } },
    create: { puestoId, deviceType, userAgent },
    update: { lastSeenAt: new Date(), userAgent },
  });

  return NextResponse.json({ ok: true });
}
