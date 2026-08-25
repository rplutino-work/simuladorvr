"use client";
import { useEffect, useRef } from "react";

const CHECK_INTERVAL_MS = 180_000; // 3min — deploys no urgen

/**
 * Polls /api/version and reloads the page when a new deploy is detected.
 * First response is stored as baseline; subsequent mismatches trigger reload.
 *
 * @param isBlocked optional getter — while it returns true (e.g. a customer is
 *   mid-payment or a QR is on screen) the reload is deferred, not dropped: the
 *   new version is remembered on the next poll after it returns false, so the
 *   tablet never yanks the screen out from under an in-progress payment.
 */
export function useAutoReload(isBlocked?: () => boolean) {
  const knownVersion = useRef<string | null>(null);
  const blockedRef = useRef(isBlocked);
  blockedRef.current = isBlocked;

  useEffect(() => {
    let active = true;

    async function check() {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return;
        const data = await res.json();
        const v = data.v as string;

        if (!knownVersion.current) {
          knownVersion.current = v;
          return;
        }

        if (v !== knownVersion.current && active) {
          // Defer the reload while a critical flow is on screen; we'll pick the
          // new version up on a later poll once it's safe.
          if (blockedRef.current?.()) return;
          knownVersion.current = v;
          window.location.reload();
        }
      } catch {
        // network error — ignore
      }
    }

    check();
    const id = setInterval(check, CHECK_INTERVAL_MS);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);
}
