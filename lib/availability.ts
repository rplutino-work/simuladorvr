import { prisma } from "@/lib/db";
import type { Prisma, PrismaClient } from "@prisma/client";

/** Accepts either the base client or an interactive transaction client. */
type DbClient = PrismaClient | Prisma.TransactionClient;

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
export async function getBusinessSettings(client: DbClient = prisma) {
  let settings = await client.businessSettings.findFirst();
  if (!settings) {
    settings = await client.businessSettings.create({
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

type MinBooking = { startTime: Date | null; endTime: Date | null };

/** Pure slot-availability computation (no DB) — shared by single-puesto and grid. */
function computeSlots(
  slots: Date[],
  bookings: MinBooking[],
  marginMs: number,
  effectiveDuration: number,
  closeTime: Date
): SlotInfo[] {
  return slots.map((slotStart) => {
    const slotEnd = new Date(slotStart.getTime() + effectiveDuration * 60 * 1000);
    if (slotEnd > closeTime) return { startTime: slotStart, available: false };
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
 * Get availability for a puesto on a given date.
 */
export async function getAvailability(
  dateStr: string,
  puestoId: string,
  minTime?: Date,
  durationMinutes?: number
): Promise<SlotInfo[]> {
  const settings = await getBusinessSettings();
  const date = new Date(dateStr);
  date.setUTCHours(0, 0, 0, 0);

  const slots = generateSlotsForDay(
    date,
    settings.openHour,
    settings.closeHour,
    settings.slotInterval,
    minTime
  );

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
    select: { startTime: true, endTime: true },
  });

  const marginMs = settings.negativeMarginMinutes * 60 * 1000;
  const effectiveDuration = durationMinutes ?? settings.slotInterval;
  const closeTime = new Date(date);
  closeTime.setUTCHours(settings.closeHour + AR_TZ_OFFSET_HOURS, 0, 0, 0);

  return computeSlots(slots, bookings, marginMs, effectiveDuration, closeTime);
}

/**
 * Check if a time range is available for a puesto (excluding optional bookingId for reschedule)
 */
export async function isSlotAvailable(
  puestoId: string,
  startTime: Date,
  endTime: Date,
  excludeBookingId?: string,
  client: DbClient = prisma
): Promise<boolean> {
  const settings = await getBusinessSettings(client);
  const marginMs = settings.negativeMarginMinutes * 60 * 1000;
  // Use UTC boundaries for consistency with getAvailability (the server runs in
  // UTC on Vercel; setHours would silently break on a non-UTC host).
  const dayStart = new Date(startTime);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(startTime);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const bookings = await client.booking.findMany({
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
    select: { id: true, name: true },
  });

  // ONE query for all puestos (was N+1: a settings read + a bookings read per
  // puesto). Group the bookings in memory and compute each puesto's slots.
  const dayStart = new Date(date);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setUTCHours(23, 59, 59, 999);
  const allBookings = await prisma.booking.findMany({
    where: {
      puestoId: { in: puestos.map((p) => p.id) },
      status: { in: ["PENDING", "PAID", "ACTIVE"] },
      startTime: { not: null, lt: dayEnd },
      endTime: { not: null, gt: dayStart },
    },
    select: { puestoId: true, startTime: true, endTime: true },
  });
  const byPuesto = new Map<string, MinBooking[]>();
  for (const b of allBookings) {
    const arr = byPuesto.get(b.puestoId) ?? [];
    arr.push(b);
    byPuesto.set(b.puestoId, arr);
  }

  const marginMs = settings.negativeMarginMinutes * 60 * 1000;
  const effectiveDuration = durationMinutes ?? settings.slotInterval;
  const closeTime = new Date(date);
  closeTime.setUTCHours(settings.closeHour + AR_TZ_OFFSET_HOURS, 0, 0, 0);

  const puestosWithSlots: DayAvailabilityPuesto[] = puestos.map((p) => ({
    id: p.id,
    name: p.name,
    slots: computeSlots(slots, byPuesto.get(p.id) ?? [], marginMs, effectiveDuration, closeTime),
  }));
  return { slots, puestos: puestosWithSlots };
}
