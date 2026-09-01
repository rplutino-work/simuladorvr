import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCachedSettings } from "@/lib/cache";

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
    // No re-lanzar: un error transitorio de DB en este endpoint público y de alta
    // frecuencia no debe tirar un 500 con stack. Devolvemos un error limpio.
    console.error("[devices/heartbeat] upsert error:", e);
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  // ¿Hay un turno PAGADO corriendo en este puesto ahora? La TV usa esto (desde
  // su latido nativo, que sigue vivo aunque esté en la consola) para volver sola
  // a la app cuando NO hay turno — así echa al que prendió la Play sin pagar, y
  // corta la TV cuando el admin cancela/finaliza una sesión.
  const active = await prisma.booking.findFirst({
    where: { puestoId, status: "ACTIVE" },
    select: { id: true, startTime: true, endTime: true, duration: true },
    orderBy: { startTime: "desc" },
  });
  // Tiempo restante REAL del turno. La TV lo usa para re-sincronizar su timer
  // nativo en CADA latido: así una lectura mala aislada no la saca a mitad de
  // sesión (el próximo latido bueno la restaura) y una extensión "sigue" al juego
  // aunque el WebView esté congelado en HDMI. Además exigimos endTime > ahora: el
  // cron que pasa ACTIVE→FINISHED corre cada 10 min y puede demorar; sin este
  // chequeo un turno vencido seguiría "activo" y la TV quedaría en el HDMI pasado
  // el fin pago = fuga.
  let sessionRemainingMs = 0;
  if (active) {
    const end =
      active.endTime ??
      new Date((active.startTime ?? new Date()).getTime() + active.duration * 60_000);
    sessionRemainingMs = end.getTime() - Date.now();
  }
  const sessionActive = sessionRemainingMs > 0;

  // ¿La pantalla debería estar prendida? (dentro de horario + puesto activo).
  // La TV usa esto para NO reafirmarse cuando corresponde estar apagada (fuera
  // de horario) — así el latido no pelea con el apagado y evita loops.
  let shouldBeOn = true;
  try {
    const settings = await getCachedSettings();
    const puesto = await prisma.puesto.findUnique({
      where: { id: puestoId },
      select: { active: true },
    });
    const hourAR = parseInt(
      new Date().toLocaleString("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "America/Argentina/Buenos_Aires",
      })
    );
    const openHour = settings?.openHour ?? 10;
    const closeHour = settings?.closeHour ?? 20;
    const withinSchedule = hourAR >= openHour && hourAR < closeHour;
    shouldBeOn = withinSchedule && (puesto?.active ?? true);
  } catch {
    shouldBeOn = true; // ante la duda, dejar la pantalla prendida
  }

  return NextResponse.json({
    ok: true,
    hasActiveSession: sessionActive,
    sessionRemainingMs: sessionActive ? sessionRemainingMs : 0,
    shouldBeOn,
  });
}
