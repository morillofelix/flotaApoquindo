export type AppointmentCreatedByType = "conductor" | "ejecutivo";

export function normalizeAppointmentCreatedByType(
  value: string,
): AppointmentCreatedByType {
  return value === "ejecutivo" ? "ejecutivo" : "conductor";
}

export function getAppointmentOriginBadge(createdByType: AppointmentCreatedByType) {
  if (createdByType === "ejecutivo") {
    return {
      label: "E",
      title: "Creada por ejecutivo",
      className:
        "border-violet-300 bg-violet-100 text-violet-800 ring-1 ring-violet-200",
    };
  }

  return {
    label: "C",
    title: "Creada por conductor",
    className: "border-sky-300 bg-sky-100 text-sky-800 ring-1 ring-sky-200",
  };
}
