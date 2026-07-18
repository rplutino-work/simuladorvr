import { prisma } from "@/lib/db";
import type { NextRequest } from "next/server";

/**
 * DB-backed fixed-window rate limiter. Not perfectly atomic under heavy
 * concurrency, but more than enough to stop brute-force and spam on the
 * low-frequency mutation endpoints (activate, direct-purchase, bookings, login).
 * These endpoints are NOT the hot polling ones, so the extra query is cheap.
 *
 * Returns { ok: true } when allowed, or { ok:false, retryAfter } when blocked.
 */
export async function rateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<{ ok: boolean; retryAfter?: number }> {
  const now = Date.now();
  try {
    const rec = await prisma.rateLimit.findUnique({ where: { key } });
    if (!rec || rec.resetAt.getTime() <= now) {
      await prisma.rateLimit.upsert({
        where: { key },
        create: { key, count: 1, resetAt: new Date(now + windowMs) },
        update: { count: 1, resetAt: new Date(now + windowMs) },
      });
      return { ok: true };
    }
    if (rec.count >= max) {
      return { ok: false, retryAfter: Math.ceil((rec.resetAt.getTime() - now) / 1000) };
    }
    await prisma.rateLimit.update({ where: { key }, data: { count: { increment: 1 } } });
    return { ok: true };
  } catch {
    // Never let the limiter break a request — fail open.
    return { ok: true };
  }
}

/** Best-effort client IP from Vercel's forwarding headers. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}
