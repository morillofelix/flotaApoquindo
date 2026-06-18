"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { type AppointmentReasonConfig } from "@/lib/appointments";
import { loadAppointmentReasons } from "@/lib/agendamientos-admin";
import { useEffect, useMemo, useState } from "react";

type ReasonForm = {
  id: string;
  label: string;
  allowsExecutiveAssignment: boolean;
  usesDateRange: boolean;
  usesPermitDetails: boolean;
  isActive: boolean;
};

type ReasonBooleanField =
  | "allowsExecutiveAssignment"
  | "usesDateRange"
  | "usesPermitDetails"
  | "isActive";

const reasonFeatureFields: Array<[ReasonBooleanField, string]> = [
  ["allowsExecutiveAssignment", "Derivar"],
  ["usesDateRange", "Rango fechas"],
  ["usesPermitDetails", "Permiso horas/días"],
  ["isActive", "Activo"],
];

const emptyReasonForm: ReasonForm = {
  id: "",
  label: "",
  allowsExecutiveAssignment: false,
  usesDateRange: false,
  usesPermitDetails: false,
  isActive: true,
};

export default function MotivosPage() {
  const [reasons, setReasons] = useState<AppointmentReasonConfig[]>([]);
  const [reasonForm, setReasonForm] = useState<ReasonForm>(emptyReasonForm);
  const [reasonSearch, setReasonSearch] = useState("");
  const [reasonMessage, setReasonMessage] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [isSavingReason, setIsSavingReason] = useState(false);

  useEffect(() => {
    loadAppointmentReasons()
      .then((loadedReasons) => setReasons(loadedReasons))
      .catch(() => setReasonError("No se pudieron cargar los motivos."));
  }, []);

  const filteredReasons = useMemo(() => {
    const normalizedSearch = reasonSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return reasons;
    }

    return reasons.filter(
      (reason) =>
        reason.label.toLowerCase().includes(normalizedSearch) ||
        reason.value.toLowerCase().includes(normalizedSearch),
    );
  }, [reasonSearch, reasons]);

  function editReason(reason: AppointmentReasonConfig) {
    setReasonForm({
      id: reason.id ?? "",
      label: reason.label,
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      usesDateRange: reason.usesDateRange,
      usesPermitDetails: reason.usesPermitDetails,
      isActive: reason.isActive,
    });
    setReasonMessage("");
    setReasonError("");
  }

  function resetReasonForm() {
    setReasonForm(emptyReasonForm);
    setReasonMessage("");
    setReasonError("");
  }

  async function saveReason(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReasonMessage("");
    setReasonError("");

    if (reasonForm.label.trim().length < 3) {
      setReasonError("Ingresa un nombre de motivo válido.");
      return;
    }

    setIsSavingReason(true);

    try {
      const response = await fetch("/api/appointment-reasons", {
        method: reasonForm.id ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(reasonForm),
      });

      if (!response.ok) {
        throw new Error("No se pudo guardar el motivo.");
      }

      const loadedReasons = await loadAppointmentReasons();
      setReasons(loadedReasons);
      setReasonForm(emptyReasonForm);
      setReasonMessage("Motivo guardado correctamente.");
    } catch {
      setReasonError("No se pudo guardar el motivo.");
    } finally {
      setIsSavingReason(false);
    }
  }

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader title="Motivos de cita" />

        <div className="overflow-hidden rounded-[22px] border border-[#d8e2ef] bg-white shadow-lg shadow-slate-200/70 sm:rounded-[24px]">
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] p-3">
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto_auto] sm:items-end">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Buscar motivo
                  </span>
                  <input
                    type="search"
                    value={reasonSearch}
                    onChange={(event) => setReasonSearch(event.target.value)}
                    className="h-9 rounded-2xl border border-[#d8e2ef] bg-white px-3 text-sm text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                    placeholder="Nombre o código"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => setReasonSearch("")}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                >
                  Limpiar
                </button>
                <button
                  type="button"
                  onClick={resetReasonForm}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                >
                  Nuevo
                </button>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#d8e2ef] bg-white">
                <div className="grid grid-cols-[1.2fr_1fr_0.7fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0f2747]">
                  <span>Nombre</span>
                  <span>Características</span>
                  <span>Estado</span>
                </div>
                <div className="max-h-[70dvh] overflow-auto divide-y divide-[#e3ebf5]">
                  {filteredReasons.map((reason) => (
                    <button
                      key={reason.value}
                      type="button"
                      onClick={() => editReason(reason)}
                      className={`grid w-full grid-cols-[1.2fr_1fr_0.7fr] gap-2 px-3 py-2 text-left text-xs transition hover:bg-[#f8fbff] ${
                        reasonForm.id === reason.id ? "bg-blue-50/70" : ""
                      }`}
                    >
                      <span>
                        <strong className="block text-[#0f2747]">
                          {reason.label}
                        </strong>
                        <span className="text-slate-500">{reason.value}</span>
                      </span>
                      <span className="text-slate-600">
                        {[
                          reason.allowsExecutiveAssignment ? "Deriva" : "",
                          reason.usesDateRange ? "Fechas" : "",
                          reason.usesPermitDetails ? "Horas/días" : "",
                        ]
                          .filter(Boolean)
                          .join(" · ") || "Sin campos"}
                      </span>
                      <span
                        className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          reason.isActive
                            ? "bg-green-50 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {reason.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <form
              noValidate
              onSubmit={saveReason}
              className="rounded-2xl border border-[#d8e2ef] bg-[#f8fbff] p-4"
            >
              <div className="mb-4 border-b border-[#e3ebf5] pb-3">
                <h4 className="font-heading text-base font-semibold text-[#0f2747]">
                  Datos generales
                </h4>
                <p className="text-xs text-slate-500">
                  Configura cómo se comporta este motivo en el formulario.
                </p>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#173b68]">
                  Nombre motivo
                </span>
                <input
                  type="text"
                  value={reasonForm.label}
                  onChange={(event) =>
                    setReasonForm((currentForm) => ({
                      ...currentForm,
                      label: event.target.value,
                    }))
                  }
                  className="h-10 rounded-2xl border border-[#d8e2ef] bg-white px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-4 focus:ring-blue-100"
                  placeholder="Ej: Capacitación"
                />
              </label>

              <div className="mt-4 grid gap-2">
                {reasonFeatureFields.map(([field, label]) => (
                  <label
                    key={field}
                    className="flex h-10 items-center justify-between rounded-2xl border border-[#d8e2ef] bg-white px-3 text-xs font-semibold text-[#173b68]"
                  >
                    {label}
                    <input
                      type="checkbox"
                      checked={reasonForm[field]}
                      onChange={(event) =>
                        setReasonForm((currentForm) => ({
                          ...currentForm,
                          [field]: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 accent-[#0b5cab]"
                    />
                  </label>
                ))}
              </div>

              {reasonMessage ? (
                <p className="mt-3 text-xs font-semibold text-green-700">
                  {reasonMessage}
                </p>
              ) : null}
              {reasonError ? (
                <p className="mt-3 text-xs font-semibold text-red-600">
                  {reasonError}
                </p>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetReasonForm}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingReason}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {reasonForm.id ? "Guardar cambios" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
