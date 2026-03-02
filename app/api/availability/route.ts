import { NextRequest, NextResponse } from "next/server";
import { getAvailability, getAvailabilityForDay } from "@/lib/availability";

/**
 * GET /api/availability?date=YYYY-MM-DD&puestoId=xxx (single puesto)
 * GET /api/availability?date=YYYY-MM-DD (day grid: all puestos)
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");
  const puestoId = searchParams.get("puestoId");
  const durationParam = searchParams.get("duration");
  const durationMinutes = durationParam ? parseInt(durationParam, 10) : undefined;

  if (!date) {
    return NextResponse.json(
      { error: "date is required" },
      { status: 400 }
    );
  }
  const parsed = new Date(date);
  if (Number.isNaN(parsed.getTime())) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  try {
    if (puestoId) {
      const slots = await getAvailability(date, puestoId, undefined, durationMinutes);
      return NextResponse.json(
        slots.map((s) => ({
          startTime: s.startTime.toISOString(),
          available: s.available,
        }))
      );
    }
    const day = await getAvailabilityForDay(date, durationMinutes);
    return NextResponse.json({
      slots: day.slots.map((d) => d.toISOString()),
      puestos: day.puestos.map((p) => ({
        id: p.id,
        name: p.name,
        slots: p.slots.map((s) => ({
          startTime: s.startTime.toISOString(),
          available: s.available,
        })),
      })),
    });
  } catch (e) {
    console.error("[availability]", e);
    return NextResponse.json({
      slots: [],
      puestos: [],
      error: "No se pudo cargar la grilla. ¿Ejecutaste npm run db:push y db:seed?",
    });
  }
}
