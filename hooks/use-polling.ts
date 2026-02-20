"use client";

import { useEffect, useCallback, useRef } from "react";

/**
 * Polling hook - fetches data at intervals
 * Abstraction layer for future WebSocket upgrade
 * @param callback - Function to execute on each poll
 * @param intervalMs - Interval in milliseconds (default 10000)
 * @param enabled - Whether polling is active
 */
export function usePolling<T>(
  callback: () => Promise<T> | T,
  intervalMs: number = 10_000,
  enabled: boolean = true
) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  const execute = useCallback(async () => {
    try {
      await callbackRef.current();
    } catch (error) {
      console.error("[usePolling] Error:", error);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    // Initial fetch
    execute();

    intervalRef.current = setInterval(execute, intervalMs);
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled, intervalMs, execute]);

  return { refetch: execute };
}
