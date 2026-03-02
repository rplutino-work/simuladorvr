import { prisma } from "@/lib/db";

const DEFAULT_SETTINGS = {
  openHour: 10,
  closeHour: 20,
  slotInterval: 15,
  negativeMarginMinutes: 0,
};

// Argentina is UTC-3 (no DST). All business-hour slots must be offset so that
// e.g. openHour=10 becomes 13:00 UTC on the server.
const AR_TZ_OFFSET_HOURS = 3;

export type SlotInfo = { startTime: Date; available: boolean };

/**
 * Get or create singleton BusinessSettings
 */
export async function getBusinessSettings() {
  let settings = await prisma.businessSettings.findFirst();
  if (!settings) {
    settings = await prisma.businessSettings.create({
      data: {
        openHour: DEFAULT_SETTINGS.openHour,
        closeHour: DEFAULT_SETTINGS.closeHour,
        slotInterval: DEFAULT_SETTINGS.slotInterval,
        allowCancel: true,
        allowReschedule: true,
        cancelLimitHours: 24,
        negativeMarginMinutes: DEFAULT_SETTINGS.negativeMarginMinutes,
      },
    });
  }
  return settings;
}

/**
 * Generate time slots for a day between openHour and closeHour.
 * Hours are treated as Argentina local time (UTC-3) and stored as UTC.
 * Pass `minTime` to exclude slots that start before that moment (filter past slots for today).
 */
export function generateSlotsForDay(
  date: Date,
  openHour: number,
  closeHour: number,
  slotIntervalMinutes: number,
  minTime?: Date
): Date[] {
  const slots: Date[] = [];
  // date is parsed from "YYYY-MM-DD" → UTC midnight.
  // We apply the Argentina offset so that openHour/closeHour are treated as
  // local Argentina time rather than server UTC time.
  const start = new Date(date);
  start.setUTCHours(openHour + AR_TZ_OFFSET_HOURS, 0, 0, 0);
  const end = new Date(date);
  end.setUTCHours(closeHour + AR_TZ_OFFSET_HOURS, 0, 0, 0);

  const current = new Date(start);
  while (current < end) {
    // Skip slots that have already started (with a 1-minute tolerance)
    if (!minTime || current.getTime() >= minTime.getTime() - 60_000) {
      slots.push(new Date(current));
    }
    current.setUTCMinutes(current.getUTCMinutes() + slotIntervalMinutes);
  }
  return slots;
}

/**
 * Check if two time ranges overlap
 * existing.startTime < newEnd AND existing.endTime > newStart
 */
function overlaps(
  existingStart: Date,
  existingEnd: Date,
  newStart: Date,
  newEnd: Date
): boolean {
  return existingStart < newEnd && existingEnd > newStart;
}

/**
 * Get availability for a puesto on a given date.
 * - `minTime`: slots before this are excluded (today filter)
 * - `durationMinutes`: the intended booking duration — used to correctly
 *   determine if a slot has enough room before the next booking. Defaults
 *   to the configured slotInterval (minimum unit check).
 */
export async function getAvailability(
  dateStr: string,
  puestoId: string,
  minTime?: Date,
  durationMinutes?: number
): Promise<SlotInfo[]> {
  const settings = await getBusinessSettings();
  const date = new Date(dateStr);
  // Keep UTC midnight so setUTCHours in generateSlotsForDay works correctly
  date.setUTCHours(0, 0, 0, 0);

  const slots = generateSlotsForDay(
    date,
    settings.openHour,
    settings.closeHour,
    settings.slotInterval,
    minTime
  );

  // Use a wide UTC window to catch all bookings for that calendar day
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const bookings = await prisma.booking.findMany({
    where: {
      puestoId,
      status: { in: ["PENDING", "PAID", "ACTIVE"] },
      startTime: { not: null, lt: dayEnd },
      endTime: { not: null, gt: dayStart },
    },
  });

  const marginMs = settings.negativeMarginMinutes * 60 * 1000;
  // How long a session starting at this slot would last
  const effectiveDuration = durationMinutes ?? settings.slotInterval;

  // Argentina close time for this day — no session may end after this
  const closeTime = new Date(date);
  closeTime.setUTCHours(settings.closeHour + AR_TZ_OFFSET_HOURS, 0, 0, 0);

  return slots.map((slotStart) => {
    // Slot end = start + the intended duration (not just the grid interval)
    const slotEnd = new Date(slotStart.getTime() + effectiveDuration * 60 * 1000);

    // Block if the session would end after the closing hour
    if (slotEnd > closeTime) {
      return { startTime: slotStart, available: false };
    }

    const isOccupied = bookings.some((b) => {
      if (!b.startTime || !b.endTime) return false;
      const exStart = new Date(b.startTime.getTime() - marginMs);
      const exEnd = new Date(b.endTime.getTime() + marginMs);
      return overlaps(exStart, exEnd, slotStart, slotEnd);
    });
    return { startTime: slotStart, available: !isOccupied };
  });
}

/**
 * Check if a time range is available for a puesto (excluding optional bookingId for reschedule)
 */
export async function isSlotAvailable(
  puestoId: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string
): Promise<boolean> {
  const settings = await getBusinessSettings();
  const marginMs = settings.negativeMarginMinutes * 60 * 1000;
  const dayStart = new Date(startTime);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(startTime);
  dayEnd.setHours(23, 59, 59, 999);

  const bookings = await prisma.booking.findMany({
    where: {
      puestoId,
      ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
      status: { in: ["PENDING", "PAID", "ACTIVE"] },
      startTime: { not: null, lt: dayEnd },
      endTime: { not: null, gt: dayStart },
    },
  });

  const hasOverlap = bookings.some((b) => {
    if (!b.startTime || !b.endTime) return false;
    const exStart = new Date(b.startTime.getTime() - marginMs);
    const exEnd = new Date(b.endTime.getTime() + marginMs);
    return overlaps(exStart, exEnd, startTime, endTime);
  });
  return !hasOverlap;
}

export type DayAvailabilityPuesto = { id: string; name: string; slots: SlotInfo[] };

/**
 * Get availability for all active puestos on a date (for day grid).
 * Automatically filters out past slots when dateStr is today.
 * Pass `durationMinutes` to apply duration-aware overlap check.
 */
export async function getAvailabilityForDay(
  dateStr: string,
  durationMinutes?: number
): Promise<{ slots: Date[]; puestos: DayAvailabilityPuesto[] }> {
  const settings = await getBusinessSettings();
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);

  // Determine if the requested date is today (Argentina time) — if so, filter past slots.
  // Compare dates as Argentina local date strings to avoid UTC-midnight boundary issues.
  const nowAR = new Date(new Date().getTime() - AR_TZ_OFFSET_HOURS * 60 * 60 * 1000);
  const todayARStr = nowAR.toISOString().slice(0, 10);
  const isToday = dateStr === todayARStr;
  const minTime = isToday ? new Date() : undefined;

  const slots = generateSlotsForDay(
    date,
    settings.openHour,
    settings.closeHour,
    settings.slotInterval,
    minTime
  );
  const puestos = await prisma.puesto.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
  });
  const puestosWithSlots: DayAvailabilityPuesto[] = await Promise.all(
    puestos.map(async (p) => ({
      id: p.id,
      name: p.name,
      slots: await getAvailability(dateStr, p.id, minTime, durationMinutes),
    }))
  );
  return { slots, puestos: puestosWithSlots };
}
