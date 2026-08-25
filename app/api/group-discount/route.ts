import { NextResponse } from "next/server";
import { getBusinessSettings } from "@/lib/availability";

/**
 * GET /api/group-discount — public, non-sensitive group discount config so the
 * /reserva grid can preview the combined discounted total live. The authoritative
 * calculation still runs server-side in POST /api/bookings/group.
 */
export async function GET() {
  const s = await getBusinessSettings();
  return NextResponse.json({
    enabled: s.groupDiscountEnabled ?? false,
    tiers: s.groupDiscountTiers ?? null,
    from: s.groupDiscountFrom ?? null,
    to: s.groupDiscountTo ?? null,
  });
}
