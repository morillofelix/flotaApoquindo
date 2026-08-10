import { type AppointmentCreatedByType } from "@/lib/appointment-origin";

type DriverApprovalAckBadgeProps = {
  createdByType: AppointmentCreatedByType;
  driverApprovalPending: boolean;
  driverApprovalRejected: boolean;
};

export default function DriverApprovalAckBadge({
  createdByType,
  driverApprovalPending,
  driverApprovalRejected,
}: DriverApprovalAckBadgeProps) {
  if (createdByType !== "ejecutivo") {
    return null;
  }

  if (driverApprovalRejected) {
    return (
      <span
        title="Conductor rechazó la solicitud"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-red-300 bg-red-100 text-[10px] font-bold leading-none text-red-700"
        aria-label="Conductor rechazó la solicitud"
      >
        ×
      </span>
    );
  }

  if (driverApprovalPending) {
    return (
      <span
        title="Pendiente de lectura o aprobación del conductor"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-amber-300 bg-amber-50 text-[9px] font-bold leading-none text-amber-700"
        aria-label="Pendiente de aprobación del conductor"
      >
        ·
      </span>
    );
  }

  return (
    <span
      title="Conductor aprobó la solicitud"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-green-300 bg-green-100 text-[10px] font-bold leading-none text-green-700"
      aria-label="Conductor aprobó la solicitud"
    >
      ✓
    </span>
  );
}
