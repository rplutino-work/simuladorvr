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

  const userAgent = req.headers.get("user-agent")?.slice(0, 255) ?? null;

  // Single query: the upsert's FK to Puesto rejects unknown puestos (P2003),
  // so we don't need a separate existence check.
  try {
    await prisma.deviceHeartbeat.upsert({
      where: { puestoId_deviceType: { puestoId, deviceType } },
      create: { puestoId, deviceType, userAgent },
      update: { lastSeenAt: new Date(), userAgent },
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "P2003") {
      return NextResponse.json({ error: "Unknown puesto" }, { status: 404 });
    }
    throw e;
  }

  return NextResponse.json({ ok: true });
}
