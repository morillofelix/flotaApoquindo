"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const DEFAULT_AUTO_REFRESH_MS = 60_000;
export const AUTO_REFRESH_IDLE_MS = 15 * 60_000;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "pointermove",
  "keydown",
  "wheel",
  "touchstart",
] as const;

type UseAutoRefreshOptions = {
  onRefresh: () => Promise<void> | void;
  intervalMs?: number;
  enabled?: boolean;
  pause?: boolean;
};

export function useAutoRefresh({
  onRefresh,
  intervalMs = DEFAULT_AUTO_REFRESH_MS,
  enabled = true,
  pause = false,
}: UseAutoRefreshOptions) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const onRefreshRef = useRef(onRefresh);
  const refreshInFlightRef = useRef(false);
  const lastActivityAtRef = useRef(0);

  useEffect(() => {
    onRefreshRef.current = onRefresh;
  }, [onRefresh]);

  const refresh = useCallback(async (options?: { showSpinner?: boolean }) => {
    if (refreshInFlightRef.current) {
      return;
    }

    refreshInFlightRef.current = true;
    const showSpinner = options?.showSpinner ?? true;

    if (showSpinner) {
      setIsRefreshing(true);
    }

    try {
      await onRefreshRef.current();
      setLastUpdatedAt(new Date());
    } finally {
      refreshInFlightRef.current = false;

      if (showSpinner) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!enabled || pause) {
      return;
    }

    if (lastActivityAtRef.current === 0) {
      lastActivityAtRef.current = Date.now();
    }

    const isIdle = () =>
      Date.now() - lastActivityAtRef.current >= AUTO_REFRESH_IDLE_MS;

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible" || isIdle()) {
        return;
      }

      void refresh({ showSpinner: false });
    }, intervalMs);

    function handleActivity() {
      const wasIdle = isIdle();
      lastActivityAtRef.current = Date.now();

      if (wasIdle && document.visibilityState === "visible") {
        void refresh({ showSpinner: false });
      }
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        lastActivityAtRef.current = Date.now();
        void refresh({ showSpinner: false });
      }
    }

    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, handleActivity, { passive: true });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, handleActivity);
      }
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, intervalMs, pause, refresh]);

  return {
    refresh,
    isRefreshing,
    lastUpdatedAt,
  };
}
