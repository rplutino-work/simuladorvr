import { Prisma, PromoCode } from "@prisma/client";

/**
 * Códigos promocionales de TIEMPO GRATIS, configurables desde el admin.
 * Acá vive la validación de entrada (crear/editar) y el chequeo de vigencia
 * (usado tanto por el canje en la tablet como para mostrar el estado en el admin).
 */

export type PromoInput = Prisma.PromoCodeUncheckedCreateInput;

// El código se tipea en el teclado de la tablet, que acepta EXACTAMENTE 4
// caracteres del mismo set que los códigos de reserva: dígitos 2-9 y letras
// A-Z SIN 0, 1, I ni O (para no confundirlos). Ver lib/code-generator.ts y el
// keypad en app/tablet/[puestoId]/page.tsx. Nada fuera de eso es ingresable.
const CODE_RE = /^[2-9A-HJ-NP-Z]{4}$/;

/** Valida + normaliza el body para crear/editar un código. Devuelve {data} o {error}. */
export function parsePromoInput(
  body: Record<string, unknown>
): { data: PromoInput } | { error: string } {
  const code = String(body.code ?? "").toUpperCase().trim();
  if (!CODE_RE.test(code))
    return { error: "El código debe tener 4 caracteres tipeables en la tablet: dígitos 2-9 y letras, sin 0, 1, I ni O." };

  const minutes = Number(body.minutes);
  if (!Number.isInteger(minutes) || minutes < 1 || minutes > 600)
    return { error: "Los minutos deben ser un entero entre 1 y 600." };

  const emptyNull = (v: unknown) => (v == null || v === "" ? null : v);

  const rawMax = emptyNull(body.maxUses);
  const maxUses = rawMax == null ? null : Number(rawMax);
  if (maxUses != null && (!Number.isInteger(maxUses) || maxUses < 1))
    return { error: "Los usos máximos deben ser un entero ≥ 1 (o vacío = ilimitado)." };

  const rawCd = emptyNull(body.cooldownMin);
  const cooldownMin = rawCd == null ? 0 : Number(rawCd);
  if (!Number.isInteger(cooldownMin) || cooldownMin < 0)
    return { error: "El cooldown debe ser un entero ≥ 0 (0 = sin cooldown)." };

  // Fechas del admin: un input date "YYYY-MM-DD" se interpreta en hora de
  // Argentina — 'desde' al arranque del día, 'hasta' al final del día (inclusive).
  const toArDate = (v: unknown, endOfDay: boolean): Date | null => {
    if (!v) return null;
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s + (endOfDay ? "T23:59:59-03:00" : "T00:00:00-03:00"));
    return new Date(s);
  };
  const validFrom = toArDate(body.validFrom, false);
  const validTo = toArDate(body.validTo, true);
  if (validFrom && isNaN(validFrom.getTime())) return { error: "La fecha 'desde' es inválida." };
  if (validTo && isNaN(validTo.getTime())) return { error: "La fecha 'hasta' es inválida." };
  if (validFrom && validTo && validFrom > validTo)
    return { error: "La fecha 'desde' no puede ser posterior a la 'hasta'." };

  const validDays = Array.isArray(body.validDays)
    ? [...new Set(body.validDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))]
    : [];

  const rawHf = emptyNull(body.validHourFrom);
  const rawHt = emptyNull(body.validHourTo);
  const validHourFrom = rawHf == null ? null : Number(rawHf);
  const validHourTo = rawHt == null ? null : Number(rawHt);
  if (validHourFrom != null && (!Number.isInteger(validHourFrom) || validHourFrom < 0 || validHourFrom > 23))
    return { error: "La hora 'desde' debe ser 0-23 (o vacío)." };
  if (validHourTo != null && (!Number.isInteger(validHourTo) || validHourTo < 1 || validHourTo > 24))
    return { error: "La hora 'hasta' debe ser 1-24 (o vacío)." };
  if (validHourFrom != null && validHourTo != null && validHourFrom >= validHourTo)
    return { error: "La hora 'desde' debe ser menor que la 'hasta'." };

  return {
    data: {
      code,
      label: body.label ? String(body.label).trim().slice(0, 80) || null : null,
      minutes,
      maxUses,
      cooldownMin,
      validFrom,
      validTo,
      validDays,
      validHourFrom,
      validHourTo,
      active: body.active !== false,
    },
  };
}

/** Hora + día de la semana en horario de Argentina. */
function argNow(now: Date): { day: number; hour: number } {
  const ar = new Date(now.toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" }));
  return { day: ar.getDay(), hour: ar.getHours() };
}

/**
 * ¿El código es canjeable AHORA? Devuelve null si sí, o el motivo (texto) si no.
 * OJO: el cooldown por-puesto y la carrera de usedCount se chequean en la
 * transacción del canje; acá va lo que no depende del puesto.
 */
export function checkPromoValidity(promo: PromoCode, now: Date = new Date()): string | null {
  if (!promo.active) return "Este código no está activo.";
  if (promo.maxUses != null && promo.usedCount >= promo.maxUses)
    return "Este código ya alcanzó su límite de usos.";
  if (promo.validFrom && now < promo.validFrom) return "Este código todavía no está vigente.";
  if (promo.validTo && now > promo.validTo) return "Este código ya venció.";

  const { day, hour } = argNow(now);
  if (promo.validDays.length > 0 && !promo.validDays.includes(day))
    return "Este código no es válido hoy.";
  if (promo.validHourFrom != null && hour < promo.validHourFrom)
    return "Este código no está vigente a esta hora.";
  if (promo.validHourTo != null && hour >= promo.validHourTo)
    return "Este código no está vigente a esta hora.";

  return null;
}
