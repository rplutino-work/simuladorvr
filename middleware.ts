import { getToken } from "next-auth/jwt";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * Edge middleware: bot filtering + best-effort per-IP rate limiting, PLUS the
 * existing NextAuth guard for /admin (preserved — see auth block near the end).
 *
 * Next 16 note: the `middleware` convention is deprecated in favour of `proxy`,
 * but still supported; kept as `middleware.ts` intentionally.
 *
 * IMPORTANT for this project: every kiosk (5 tablets + 5 TVs) and any customer
 * on the venue Wi-Fi share ONE public IP (NAT). The high-frequency internal
 * routes those devices hit (heartbeat, version poll, tablet WebView, MP webhook,
 * GitHub cron) are EXEMPT below so protection never breaks the live operation.
 */

// SEO scrapers + aggressive AI crawlers → hard 403.
const BLOCKED_BOTS = [
  "semrushbot", "ahrefsbot", "dotbot", "mj12bot", "bytespider", "gptbot",
  "claudebot", "ccbot", "dataforseo", "petalbot", "zoominfobot", "megaindex",
];

// Legit crawlers + social unfurlers — allowed through the generic bot check.
const GOOD_BOTS = [
  "googlebot", "bingbot", "yandexbot", "duckduckbot", "facebookexternalhit",
  "twitterbot", "linkedinbot", "whatsapp", "telegram",
];

// Generic automation signatures → throttled (429) unless a GOOD_BOT above.
const BOT_PATTERNS = [
  "bot", "crawl", "spider", "scrape", "curl", "wget", "python-", "httpx",
  "axios", "node-fetch", "go-http", "headless",
];

// ── In-memory fixed-window rate limiter ──────────────────────────────────────
// Best-effort only: each edge instance keeps its own Map (not shared globally),
// and it resets on cold start. Enough to blunt a single abusive source.
type Bucket = { count: number; reset: number };
const buckets = new Map<string, Bucket>();
const MAX_ENTRIES = 5000;
const WINDOW_MS = 60_000;
const API_LIMIT = 200; // per IP / minute for API (and any proxy) routes
const PAGE_LIMIT = 60; // per IP / minute for page requests

function overLimit(key: string, limit: number): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.reset <= now) {
    // Evict when the map grows too large: drop expired entries, then hard-clear
    // if still oversized (prevents unbounded memory in a warm instance).
    if (buckets.size > MAX_ENTRIES) {
      for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
      if (buckets.size > MAX_ENTRIES) buckets.clear();
    }
    b = { count: 0, reset: now + WINDOW_MS };
    buckets.set(key, b);
  }
  b.count += 1;
  return b.count > limit;
}

function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("x-real-ip")?.trim() || "unknown";
}

// Routes that bypass ALL protection: static assets + our OWN internal endpoints
// that legitimate machines hit (this app has NO external proxy/rewrite targets).
function isExempt(p: string): boolean {
  // Static assets
  if (
    p.startsWith("/_next/") ||
    p.startsWith("/icons/") ||
    p === "/favicon.ico" ||
    p === "/robots.txt" ||
    p === "/sitemap.xml" ||
    p === "/manifest.json" ||
    p === "/sw.js"
  ) return true;
  if (/\.(?:png|jpe?g|gif|svg|webp|avif|ico|css|js|woff2?|ttf|otf|map|txt|xml)$/i.test(p)) return true;

  // Internal own API hit by our own devices/services — blocking these would
  // break payments, the cron safety-net, kiosk polling, or sign-in.
  if (p.startsWith("/api/webhooks/")) return true;      // incoming MercadoPago webhooks
  if (p.startsWith("/api/cron/")) return true;          // GitHub Actions (curl UA)
  if (p.startsWith("/api/tablet/")) return true;        // kiosk WebView (shared venue IP)
  if (p.startsWith("/api/auth/")) return true;          // NextAuth (session/csrf/callback)
  if (p === "/api/devices/heartbeat") return true;      // native APK (Dalvik UA) + browser fallback
  if (p === "/api/version") return true;                // kiosk deploy poll (~every 20s)

  return false;
}

function deny(status: number, message: string): NextResponse {
  const headers: Record<string, string> = { "content-type": "text/plain; charset=utf-8" };
  if (status === 429) headers["Retry-After"] = "60";
  return new NextResponse(message, { status, headers });
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ── Bot + rate-limit protection (skips exempt static/internal routes) ──────
  if (!isExempt(pathname)) {
    const ua = (req.headers.get("user-agent") ?? "").toLowerCase();

    // 1. Known bad bots → 403.
    if (ua && BLOCKED_BOTS.some((b) => ua.includes(b))) return deny(403, "Forbidden");

    // 2. Missing or suspiciously short user-agent → 403.
    if (ua.length < 10) return deny(403, "Forbidden");

    const isGoodBot = GOOD_BOTS.some((g) => ua.includes(g));

    // 3. Generic bot-like signature (unless a whitelisted good bot) → 429.
    if (!isGoodBot && BOT_PATTERNS.some((p) => ua.includes(p))) return deny(429, "Too Many Requests");

    // 4. Per-IP rate limit: 200/min for API (+ any proxy) routes, 60/min for pages.
    const isApi = pathname.startsWith("/api/");
    const key = `${clientIp(req)}:${isApi ? "a" : "p"}`;
    if (overLimit(key, isApi ? API_LIMIT : PAGE_LIMIT)) return deny(429, "Too Many Requests");
  }

  // ── Existing NextAuth guard for /admin (preserved) ─────────────────────────
  if (pathname.startsWith("/admin") && !pathname.startsWith("/admin/login")) {
    const token = await getToken({
      req,
      secret: process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET,
    });
    if (!token) {
      const loginUrl = new URL("/admin/login", req.nextUrl.origin);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

// Broadened from ["/admin/:path*"] so bot/rate-limit protection covers the whole
// site + API; finer exemptions (static + internal machine routes) live in
// isExempt(). Only Next's static output is excluded here.
export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
