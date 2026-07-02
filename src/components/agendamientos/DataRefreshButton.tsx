"use client";

import { formatRefreshTooltip } from "@/lib/data-refresh";

type DataRefreshButtonProps = {
  onRefresh: () => void;
  isRefreshing?: boolean;
  lastUpdatedAt?: Date | null;
  className?: string;
  variant?: "default" | "toolbar";
};

const variantClassName = {
  default:
    "h-9 w-9 rounded-full border border-[#9fb8d9] bg-white text-[#0f2747] shadow-[0_1px_2px_rgba(15,39,71,0.05)] hover:border-[#0b5cab] hover:bg-[#f8fbff]",
  toolbar:
    "h-8 w-8 rounded-xl border border-transparent bg-transparent text-slate-500 shadow-none hover:border-[#c5d8eb] hover:bg-[#f8fbff] hover:text-[#0b5cab]",
};

export default function DataRefreshButton({
  onRefresh,
  isRefreshing = false,
  lastUpdatedAt = null,
  className = "",
  variant = "default",
}: DataRefreshButtonProps) {
  return (
    <button
      type="button"
      onClick={onRefresh}
      aria-label="Actualizar datos"
      title={formatRefreshTooltip(lastUpdatedAt)}
      className={`inline-flex shrink-0 items-center justify-center transition active:translate-y-px disabled:cursor-wait disabled:opacity-70 ${variantClassName[variant]} ${className}`}
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
