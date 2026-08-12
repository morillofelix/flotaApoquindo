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
    const rejectionTitle = driverApprovalMessage
      ? `Conductor rechazó: ${driverApprovalMessage}`
      : "Conductor rechazó la solicitud";

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
