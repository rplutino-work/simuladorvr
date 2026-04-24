import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getBusinessSettings } from "@/lib/availability";

const TIERS = [30, 60, 120] as const;
const AR_TZ_OFFSET_HOURS = 3;
const MIN_USABLE_MINUTES = 10;
const ROUND_STEP_MINUTES = 5;
const ROUND_STEP_CENTS = 10000; // $100 in cents
const MAX_PARTIAL_GAP_MINUTES = 15; // a tier can be offered as partial only if
                                    // the gap to the full tier is <= this

function roundDownTo(n: number, step: number) {
  return Math.floor(n / step) * step;
}
function roundUpTo(n: number, step: number) {
  return Math.ceil(n / step) * step;
}

/**
 * GET /api/tablet/[puestoId]/direct-options
 *
 * Returns 30/60/120 minute options with actual available minutes and
 * proportional price, taking into account the next booking and the
 * business closing time.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ puestoId: string }> }
) {
  try {
    const { puestoId } = await params;

    const [puesto, settings] = await Promise.all([
      prisma.puesto.findUnique({ where: { id: puestoId } }),
      getBusinessSettings(),
    ]);

    if (!puesto || !puesto.active) {
      return NextResponse.json(
        { error: "Puesto no disponible" },
        { status: 404 }
      );
    }

    const now = new Date();

    // Buenos Aires local hour — screen closed outside business hours
    const buenosAiresHour = parseInt(
      now.toLocaleString("en-US", {
        hour: "numeric",
        hour12: false,
        timeZone: "America/Argentina/Buenos_Aires",
      })
    );
    const withinSchedule =
      buenosAiresHour >= settings.openHour && buenosAiresHour < settings.closeHour;

    if (!withinSchedule) {
      return NextResponse.json({
        options: TIERS.map((t) => {
          const fp = puesto[`price${t}` as "price30" | "price60" | "price120"] ?? 0;
          return {
            requested: t,
            fullPriceCents: fp,
            actualMinutes: 0,
            priceCents: 0,
            available: false,
            reason: "Fuera de horario",
          };
        }),
      });
    }

    // Closing time today (UTC, from AR local close hour)
    const today = new Date(now);
    today.setUTCHours(0, 0, 0, 0);
    // Advance to the AR-local date (the current calendar day in AR)
    const nowAR = new Date(now.getTime() - AR_TZ_OFFSET_HOURS * 60 * 60 * 1000);
    today.setUTCFullYear(nowAR.getUTCFullYear(), nowAR.getUTCMonth(), nowAR.getUTCDate());
    const closeTime = new Date(today);
    closeTime.setUTCHours(settings.closeHour + AR_TZ_OFFSET_HOURS, 0, 0, 0);

    // Find next upcoming booking on this puesto (PENDING/PAID/ACTIVE) that
    // starts after "now" and would block time from "now" onwards.
    const nextBooking = await prisma.booking.findFirst({
      where: {
        puestoId,
        status: { in: ["PENDING", "PAID", "ACTIVE"] },
        startTime: { not: null, gte: now },
      },
      orderBy: { startTime: "asc" },
      select: { startTime: true },
    });

    const ceilingTime = nextBooking?.startTime
      ? new Date(
          Math.min(nextBooking.startTime.getTime(), closeTime.getTime())
        )
      : closeTime;

    const maxAvailableMinutes = Math.max(
      0,
      Math.floor((ceilingTime.getTime() - now.getTime()) / (60 * 1000))
    );

    const options = TIERS.map((tier) => {
      const tierPriceKey = `price${tier}` as "price30" | "price60" | "price120";
      const fullPrice = puesto[tierPriceKey] ?? 0;

      // `fullPriceCents` is ALWAYS returned for every tier, even if the tier
      // is not currently purchasable — the UI shows it as reference price.
      const base = {
        requested: tier,
        fullPriceCents: fullPrice,
      };

      if (fullPrice <= 0) {
        return {
          ...base,
          actualMinutes: 0,
          priceCents: 0,
          available: false,
          reason: "Precio no configurado",
        };
      }

      // Cap at available minutes, rounded down to a multiple of 5
      const capped = Math.min(tier, maxAvailableMinutes);
      const actualMinutes = roundDownTo(capped, ROUND_STEP_MINUTES);
      const gap = tier - actualMinutes;
      const isPartial = gap > 0;

      // If the tier doesn't fit fully, only offer it as partial when the gap
      // is small (<=15 min by default). Anything wider falls back to a
      // smaller tier — this prevents "tier 120 capped to 60 min at the
      // tier-120 proportional rate" absurdities.
      if (isPartial && gap > MAX_PARTIAL_GAP_MINUTES) {
        return {
          ...base,
          actualMinutes: 0,
          priceCents: 0,
          available: false,
          reason: nextBooking?.startTime
            ? "Hay una reserva próxima — elegí una opción menor"
            : "No entra antes del cierre",
        };
      }

      if (actualMinutes < MIN_USABLE_MINUTES) {
        return {
          ...base,
          actualMinutes: 0,
          priceCents: 0,
          available: false,
          reason:
            nextBooking?.startTime
              ? "Próxima reserva muy cerca"
              : "Fuera de horario",
        };
      }

      // Proportional pricing: (tier price / tier minutes) × actual minutes
      const rawPrice = Math.round(fullPrice * (actualMinutes / tier));
      // Round UP to multiple of $100 so we never undercharge
      const priceCents = roundUpTo(rawPrice, ROUND_STEP_CENTS);

      return {
        ...base,
        actualMinutes,
        priceCents,
        available: true,
        partial: isPartial,
        ceilingTime: isPartial ? ceilingTime.toISOString() : null,
      };
    });

    return NextResponse.json({ options });
  } catch (err) {
    console.error("[tablet/direct-options]", err);
    return NextResponse.json(
      { error: "Error al calcular opciones" },
      { status: 500 }
    );
  }
}
