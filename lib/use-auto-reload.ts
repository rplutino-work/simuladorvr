"use client";
import { useEffect, useRef } from "react";

const CHECK_INTERVAL_MS = 60_000; // check every 60 seconds

/**
 * Polls /api/version and reloads the page when a new deploy is detected.
 * First response is stored as baseline; subsequent mismatches trigger reload.
 */
export function useAutoReload() {
  const knownVersion = useRef<string | null>(null);

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
