"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const DEFAULT_AUTO_REFRESH_MS = 60_000;

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

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }

      void refresh({ showSpinner: false });
    }, intervalMs);

    return () => window.clearInterval(intervalId);
  }, [enabled, intervalMs, pause, refresh]);

  useEffect(() => {
    if (!enabled || pause) {
      return;
    }

    function handleVisibilityChange() {
      if (document.visibilityState === "visible") {
        void refresh({ showSpinner: false });
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [enabled, pause, refresh]);

  return {
    refresh,
    isRefreshing,
    lastUpdatedAt,
  };
}
