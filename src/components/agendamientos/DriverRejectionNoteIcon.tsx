"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

type DriverRejectionNoteIconProps = {
  note: string;
};

function CommentIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4.2 11.4 2.8 13V4.8A1.8 1.8 0 0 1 4.6 3h6.8A1.8 1.8 0 0 1 13.2 4.8v4.4A1.8 1.8 0 0 1 11.4 11H5.1l-.9.4z" />
      <path d="M5.4 6.2h5.2" />
      <path d="M5.4 8.4h3.6" />
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
        className="inline-flex size-6 shrink-0 items-center justify-center rounded-full border border-rose-300 bg-rose-50 text-rose-700 transition hover:border-rose-400 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300/60"
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
