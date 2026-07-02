"use client";

import { formatRefreshTooltip } from "@/lib/data-refresh";

type DataRefreshButtonProps = {
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdatedAt?: Date | null;
  className?: string;
};

export default function DataRefreshButton({
  onRefresh,
  isRefreshing = false,
  lastUpdatedAt = null,
  className = "",
}: DataRefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      aria-label="Actualizar datos"
      title={formatRefreshTooltip(lastUpdatedAt)}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#9fb8d9] bg-white text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] transition hover:border-[#0b5cab] hover:bg-[#f8fbff] active:translate-y-px disabled:cursor-wait disabled:opacity-70 ${className}`}
      disabled={isRefreshing}
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden="true"
        className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v5h-5" />
      </svg>
    </button>
  );
}
