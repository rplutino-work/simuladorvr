/**
 * Minimal structured logger.
 *
 * Emits single-line JSON so Vercel's log drains (and later Sentry/Datadog/etc.)
 * can parse level, message and context without regex. Intentionally dependency-
 * free: when you wire an error tracker, forward `logger.error` from the one
 * place marked below instead of sprinkling SDK calls across the codebase.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("booking.created", { bookingId, puestoId });
 *   logger.error("refund.failed", { bookingId }, err);
 */

type Level = "debug" | "info" | "warn" | "error";
type Context = Record<string, unknown>;

function serializeError(err: unknown): Context | undefined {
  if (!err) return undefined;
  if (err instanceof Error) {
    return { name: err.name, message: err.message, stack: err.stack };
  }
  return { error: String(err) };
}

function emit(level: Level, event: string, context?: Context, err?: unknown) {
  const line: Context = {
    level,
    event,
    ts: new Date().toISOString(),
    ...context,
  };
  const serialized = serializeError(err);
  if (serialized) line.err = serialized;

  const out = JSON.stringify(line);
  if (level === "error") {
    // ── Hook point ──────────────────────────────────────────────────────
    // When an error tracker is added (e.g. Sentry), forward it here:
    //   Sentry.captureException(err ?? new Error(event), { extra: context });
    console.error(out);
  } else if (level === "warn") {
    console.warn(out);
  } else {
    console.log(out);
  }
}

export const logger = {
  debug: (event: string, context?: Context) => emit("debug", event, context),
  info: (event: string, context?: Context) => emit("info", event, context),
  warn: (event: string, context?: Context) => emit("warn", event, context),
  error: (event: string, context?: Context, err?: unknown) =>
    emit("error", event, context, err),
};
