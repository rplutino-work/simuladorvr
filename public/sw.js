// Race Room Tablet Service Worker
// Goal: a kiosk that has loaded once keeps showing its screen even if the
// venue Wi-Fi drops. Network-first (so a fresh deploy is always picked up when
// online), with a cache fallback so an offline reload still renders.
const CACHE = "raceroom-v2";
const SHELL = [
  "/tablet",
  "/manifest.json",
  "/race-room-logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  // addAll fails atomically if any URL 404s; add best-effort one by one so a
  // single missing asset doesn't abort the whole install.
  e.waitUntil(
    caches.open(CACHE).then((c) =>
      Promise.all(SHELL.map((u) => c.add(u).catch(() => {})))
    )
  );
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const { request } = e;
  // Only GET is cacheable; let everything else (POST to /api, etc.) pass through.
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // API: always live network, never cache. The app's own try/catch handles
  // failures (the countdown keeps running locally while offline).
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(request));
    return;
  }

  // Navigations: network-first, fall back to the exact cached page, then to
  // the generic /tablet shell so the screen is never a browser error page.
  if (request.mode === "navigate") {
    e.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const clone = res.clone();
            caches.open(CACHE).then((c) => c.put(request, clone));
          }
          return res;
        })
        .catch(async () =>
          (await caches.match(request)) ||
          (await caches.match("/tablet")) ||
          Response.error()
        )
    );
    return;
  }

  // Static assets: network-first, cache only successful responses.
  e.respondWith(
    fetch(request)
      .then((res) => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then((c) => c.put(request, clone));
        }
        return res;
      })
      .catch(() => caches.match(request))
  );
});
