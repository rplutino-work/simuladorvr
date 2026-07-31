/**
 * Progressive group discount: booking several puestos together gets a % off,
 * scaling up (default 5%→20% for 2→5 puestos, so 5×1h lands on $40.000).
 * Configured in the admin (BusinessSettings): enabled flag, a {count: pct} map
 * and an optional validity window (for time-boxed promos like inauguración).
 */

export type GroupTiers = Record<string, number>;

export const DEFAULT_GROUP_TIERS: GroupTiers = { "2": 5, "3": 10, "4": 15, "5": 20 };

type GroupSettings = {
  groupDiscountEnabled: boolean;
  groupDiscountTiers: unknown;
  groupDiscountFrom: Date | null;
  groupDiscountTo: Date | null;
};

/** Returns the discount percentage (0–100) for `count` puestos booked together. */
export function groupDiscountPct(s: GroupSettings, count: number, now: Date = new Date()): number {
  if (!s.groupDiscountEnabled || count < 2) return 0;
  if (s.groupDiscountFrom && now < s.groupDiscountFrom) return 0;
  if (s.groupDiscountTo && now > s.groupDiscountTo) return 0;

  const tiers = (s.groupDiscountTiers && typeof s.groupDiscountTiers === "object"
    ? (s.groupDiscountTiers as GroupTiers)
    : {}) as GroupTiers;

  // Exact tier, else the highest defined tier <= count (6 puestos → 5-tier).
  let pct = tiers[String(count)];
  if (pct == null) {
    const below = Object.keys(tiers)
      .map(Number)
      .filter((k) => k <= count)
      .sort((a, b) => b - a);
    pct = below.length ? tiers[String(below[0])] : 0;
  }
  return Math.max(0, Math.min(100, Number(pct) || 0));
}

/**
 * Splits a discounted group total across N puestos so each booking stores its
 * fair share (revenue metrics stay accurate). Cents; the remainder from
 * rounding is added to the first booking.
 */
export function splitGroupTotal(totalCents: number, count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(totalCents / count);
  const shares = Array(count).fill(base);
  shares[0] += totalCents - base * count;
  return shares;
}
