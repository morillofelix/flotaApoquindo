import type { PropietarioChangeRecord } from "@/lib/propietarios-changes";
import type { PropietarioStatus } from "@/lib/propietario-status";

export const PROPIETARIO_HISTORY_PAGE_SIZE = 20;
export const PROPIETARIO_HISTORY_MAX_PAGE_SIZE = 50;

export const PROPIETARIO_HISTORY_MOVEMENT_OPTIONS = [
  { value: "data_update", label: "Actualización de datos" },
  { value: "status_change", label: "Cambio de estado" },
] as const;

export type PropietarioHistoryMovement =
  (typeof PROPIETARIO_HISTORY_MOVEMENT_OPTIONS)[number]["value"];

export type PropietarioHistoryNotificationStatus =
  | "not_required"
  | "pending"
  | "sent"
  | "failed";

export type PropietarioHistoryEntry = {
  id: string;
  propietarioId: string | null;
  propietarioName: string;
  propietarioRut: string;
  vehicleNumber: string;
  actorName: string;
  movementType: PropietarioHistoryMovement;
  movementLabel: string;
  changes: PropietarioChangeRecord[];
  changedFields: string[];
  previousStatus: PropietarioStatus | "";
  newStatus: PropietarioStatus | "";
  notificationStatus: PropietarioHistoryNotificationStatus;
  createdAt: string;
  currentStatus: PropietarioStatus | null;
  currentUpdatedAt: string | null;
};

export type PropietarioHistoryResponse = {
  records: PropietarioHistoryEntry[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  filterOptions: {
    actors: Array<{ id: string; name: string }>;
    fields: Array<{ value: string; label: string }>;
  };
};

export function getPropietarioHistoryMovementLabel(value: string) {
  return (
    PROPIETARIO_HISTORY_MOVEMENT_OPTIONS.find(
      (option) => option.value === value,
    )?.label ?? value
  );
}
