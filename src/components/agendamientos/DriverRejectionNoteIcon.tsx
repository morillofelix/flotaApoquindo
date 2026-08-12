"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type DriverRejectionNoteIconProps = {
  note: string;
};

function CommentIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7.5 18.5 4.5 21v-3.2A7.5 7.5 0 1 1 12 19.5c-1.5 0-2.9-.4-4.1-1.1L7.5 18.5z" />
      <path d="M9 11h6" />
      <path d="M9 14h4" />
      <path d="M9 8h6" />
    </svg>
  );
}

export default function DriverRejectionNoteIcon({
  note,
}: DriverRejectionNoteIconProps) {
  const trimmed = note.trim();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) {
      return;
    }

    const rect = buttonRef.current.getBoundingClientRect();
    const panelWidth = 240;
    const estimatedHeight = 96;
    const gap = 6;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUpward = spaceBelow < estimatedHeight + 12;

    let left = rect.left;
    left = Math.max(8, Math.min(left, window.innerWidth - panelWidth - 8));

    const top = openUpward
      ? Math.max(8, rect.top - estimatedHeight - gap)
      : Math.min(rect.bottom + gap, window.innerHeight - estimatedHeight - 8);

    setPosition({ top, left });
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        buttonRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    function handleViewportChange() {
      setOpen(false);
    }

    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("scroll", handleViewportChange, true);
    window.addEventListener("resize", handleViewportChange);

    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("scroll", handleViewportChange, true);
      window.removeEventListener("resize", handleViewportChange);
    };
  }, [open]);

  if (!trimmed) {
    return null;
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title="Ver observación del conductor"
        aria-label="Ver observación del conductor"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-full border border-rose-300 bg-rose-50 text-rose-700 transition hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
      >
        <CommentIcon />
      </button>

      {open && position ? (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Observación del conductor"
          style={{
            position: "fixed",
            top: position.top,
            left: position.left,
            zIndex: 80,
            width: 240,
          }}
          className="rounded-xl border border-rose-200 bg-white p-3 shadow-lg shadow-slate-300/40"
        >
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-rose-800">
            Observación del conductor
          </p>
          <p className="mt-1.5 text-xs font-medium leading-5 text-[#0f2747]">
            {trimmed}
          </p>
        </div>
      ) : null}
    </>
  );
}
