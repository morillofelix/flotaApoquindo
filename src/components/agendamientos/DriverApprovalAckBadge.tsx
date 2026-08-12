"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { type AppointmentCreatedByType } from "@/lib/appointment-origin";

type DriverApprovalAckBadgeProps = {
  createdByType: AppointmentCreatedByType;
  driverApprovalPending: boolean;
  driverApprovalRejected: boolean;
  driverApprovalMessage?: string;
};

const badgeBaseClass =
  "inline-flex size-6 shrink-0 items-center justify-center rounded-full border";

function RejectIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      <path d="M4.5 4.5 11.5 11.5" />
      <path d="M11.5 4.5 4.5 11.5" />
    </svg>
  );
}

function PendingIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="8" r="5.25" />
      <path d="M8 5.25V8l1.75 1.25" />
    </svg>
  );
}

function ApprovedIcon() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      className="size-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3.5 8.25 6.5 11.25 12.5 4.75" />
    </svg>
  );
}

function RejectedBadge({ message }: { message: string }) {
  const trimmed = message.trim();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(
    null,
  );
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rejectionTitle = trimmed
    ? `Conductor rechazó: ${trimmed}`
    : "Conductor rechazó la solicitud";

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !trimmed) {
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
  }, [open, trimmed]);

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
    return (
      <span
        title={rejectionTitle}
        className={`${badgeBaseClass} border-red-300 bg-red-50 text-red-700`}
        aria-label={rejectionTitle}
      >
        <RejectIcon />
      </span>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        title={rejectionTitle}
        aria-label="Ver observación del rechazo"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={`${badgeBaseClass} border-red-300 bg-red-50 text-red-700 transition hover:border-red-400 hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/60`}
      >
        <RejectIcon />
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

export default function DriverApprovalAckBadge({
  createdByType,
  driverApprovalPending,
  driverApprovalRejected,
  driverApprovalMessage = "",
}: DriverApprovalAckBadgeProps) {
  if (createdByType !== "ejecutivo") {
    return null;
  }

  if (driverApprovalRejected) {
    return <RejectedBadge message={driverApprovalMessage} />;
  }

  if (driverApprovalPending) {
    return (
      <span
        title="Pendiente de lectura o aprobación del conductor"
        className={`${badgeBaseClass} border-amber-300 bg-amber-50 text-amber-700`}
        aria-label="Pendiente de aprobación del conductor"
      >
        <PendingIcon />
      </span>
    );
  }

  return (
    <span
      title="Conductor aprobó la solicitud"
      className={`${badgeBaseClass} border-green-300 bg-green-50 text-green-700`}
      aria-label="Conductor aprobó la solicitud"
    >
      <ApprovedIcon />
    </span>
  );
}
