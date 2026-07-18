import { NextResponse } from "next/server";
import { getCachedActivePuestos } from "@/lib/cache";

/**
 * GET /api/puestos
 * Returns active puestos for public booking (cached — hit by every kiosk boot).
 */
export async function GET() {
  const puestos = await getCachedActivePuestos();
  return NextResponse.json(puestos);
}
