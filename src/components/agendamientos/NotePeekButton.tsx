"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";

const toneStyles = {
  navy: {
    button:
      "border-[#9fb8d9] text-[#0b5cab] hover:border-[#0b5cab] hover:bg-[#eef6ff]",
    eyebrow: "text-[#0b5cab]",
    action:
      "bg-[#0b5cab] shadow-blue-900/15 hover:bg-[#084a8c]",
  },
  amber: {
    button:
      "border-amber-200 text-amber-800 hover:border-amber-400 hover:bg-amber-50",
    eyebrow: "text-amber-800",
    action:
      "bg-amber-700 shadow-amber-900/15 hover:bg-amber-800",
  },
} as const;

type NotePeekButtonProps = {
  message: string;
  eyebrow: string;
  title: string;
  ariaLabel: string;
  tone?: keyof typeof toneStyles;
};

export default function NotePeekButton({
  message,
  eyebrow,
  title,
  ariaLabel,
  tone = "navy",
}: NotePeekButtonProps) {
  const [open, setOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const styles = toneStyles[tone];

  useEffect(() => {
    if (!open) {
      return;
    }

    closeButtonRef.current?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const dialog =
    open && typeof document !== "undefined"
      ? createPortal(
          <div
            aria-labelledby={titleId}
            aria-modal="true"
            className="fixed inset-0 z-[100] flex items-end justify-center bg-[#0f2747]/55 px-3 py-3 backdrop-blur-[2px] sm:items-center sm:px-4 sm:py-6"
            role="dialog"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-md overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-2xl shadow-slate-900/25 sm:rounded-[24px]"
              onClick={(event) => event.stopPropagation()}
            >
              <div className="border-b border-[#c5d8eb] bg-[#eef3f9] px-4 py-3.5 sm:px-5 sm:py-4">
                <p
                  className={`text-[10px] font-semibold uppercase tracking-[0.16em] sm:text-xs ${styles.eyebrow}`}
                >
                  {eyebrow}
                </p>
                <h2
                  id={titleId}
                  className="mt-1.5 font-heading text-lg font-semibold leading-tight text-[#0f2747] sm:mt-2 sm:text-xl"
                >
                  {title}
                </h2>
              </div>

              <div className="px-4 py-4 sm:px-5 sm:py-5">
                <p className="whitespace-pre-wrap rounded-2xl border border-[#c5d8eb] bg-[#f8fbff] px-4 py-3 text-sm font-medium leading-6 text-[#0f2747]">
                  {message}
                </p>

                <div className="mt-5 flex justify-end">
                  <button
                    ref={closeButtonRef}
                    type="button"
                    onClick={() => setOpen(false)}
                    className={`inline-flex h-11 items-center justify-center rounded-2xl px-5 text-sm font-semibold text-white shadow-md transition active:translate-y-px ${styles.action}`}
                  >
                    Entendido
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        type="button"
        aria-label={ariaLabel}
        title={ariaLabel}
        onClick={() => setOpen(true)}
        className={`inline-flex size-8 shrink-0 items-center justify-center rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,39,71,0.06)] transition ${styles.button}`}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          className="size-[18px]"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
        </svg>
      </button>
      {dialog}
    </>
  );
}
