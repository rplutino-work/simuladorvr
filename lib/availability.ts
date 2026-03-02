import { prisma } from "@/lib/db";

const DEFAULT_SETTINGS = {
  openHour: 10,
  closeHour: 20,
  slotInterval: 15,
  negativeMarginMinutes: 0,
};

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
 * Pass `minTime` to exclude slots that start before that moment (e.g. filter past slots for today).
 */
export function generateSlotsForDay(
  date: Date,
  openHour: number,
  closeHour: number,
  slotIntervalMinutes: number,
  minTime?: Date
): Date[] {
  const slots: Date[] = [];
  const start = new Date(date);
  start.setHours(openHour, 0, 0, 0);
  const end = new Date(date);
  end.setHours(closeHour, 0, 0, 0);

  const current = new Date(start);
  while (current < end) {
    // Skip slots that have already started (with a 1-minute tolerance)
    if (!minTime || current.getTime() >= minTime.getTime() - 60_000) {
      slots.push(new Date(current));
    }
    current.setMinutes(current.getMinutes() + slotIntervalMinutes);
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
 * When minTime is provided, slots before that time are returned as unavailable.
 */
export async function getAvailability(
  dateStr: string,
  puestoId: string,
  minTime?: Date
): Promise<SlotInfo[]> {
  const settings = await getBusinessSettings();
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  const slots = generateSlotsForDay(
    date,
    settings.openHour,
    settings.closeHour,
    settings.slotInterval,
    minTime
  );

  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);

  const bookings = await prisma.booking.findMany({
    where: {
      puestoId,
      status: { in: ["PENDING", "PAID", "ACTIVE"] },
      startTime: { not: null, lt: dayEnd },
      endTime: { not: null, gt: dayStart },
    },
  });

  const marginMs = settings.negativeMarginMinutes * 60 * 1000;

  return slots.map((slotStart) => {
    const slotEnd = new Date(slotStart.getTime() + settings.slotInterval * 60 * 1000);
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
 */
export async function getAvailabilityForDay(
  dateStr: string
): Promise<{ slots: Date[]; puestos: DayAvailabilityPuesto[] }> {
  const settings = await getBusinessSettings();
  const date = new Date(dateStr);
  date.setHours(0, 0, 0, 0);

  // Determine if the requested date is today — if so, filter past slots
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isToday = date.getTime() === today.getTime();
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
      slots: await getAvailability(dateStr, p.id, minTime),
    }))
  );
  return { slots, puestos: puestosWithSlots };
}
