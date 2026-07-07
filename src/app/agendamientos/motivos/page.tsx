"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import {
  type AppointmentReasonConfig,
  type WeekdayKey,
  type WeekdayBusinessAdvanceConfig,
  weekdayOptions,
  formatRestrictedWeekdays,
  formatBusinessDayAdvanceSummary,
  createDefaultWeekdayBusinessAdvance,
} from "@/lib/appointments";
import {
  downloadAppointmentReasonsExcel,
  loadAppointmentReasons,
} from "@/lib/agendamientos-admin";
import { adminFetchInit } from "@/lib/admin-fetch";
import { uiListRowClass } from "@/lib/ui-borders";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useCallback, useEffect, useMemo, useState } from "react";

type ReasonForm = {
  id: string;
  label: string;
  allowsExecutiveAssignment: boolean;
  usesAppointmentDuration: boolean;
  appointmentDurationMinutes: number;
  usesServiceStartTime: boolean;
  serviceStartTime: string;
  usesDateRange: boolean;
  usesPermitDetails: boolean;
  isActive: boolean;
  restrictedWeekdays: WeekdayKey[];
  weekdayBusinessAdvance: WeekdayBusinessAdvanceConfig;
};

type ReasonBooleanField =
  | "allowsExecutiveAssignment"
  | "usesDateRange"
  | "usesPermitDetails"
  | "isActive";

const reasonFeatureFields: Array<[ReasonBooleanField, string]> = [
  ["usesDateRange", "Rango fechas"],
  ["usesPermitDetails", "Permiso horas/días"],
  ["isActive", "Activo"],
];

const emptyReasonForm: ReasonForm = {
  id: "",
  label: "",
  allowsExecutiveAssignment: false,
  usesAppointmentDuration: false,
  appointmentDurationMinutes: 30,
  usesServiceStartTime: false,
  serviceStartTime: "09:00",
  usesDateRange: false,
  usesPermitDetails: false,
  isActive: true,
  restrictedWeekdays: [],
  weekdayBusinessAdvance: createDefaultWeekdayBusinessAdvance(),
};

export default function MotivosPage() {
  const [reasons, setReasons] = useState<AppointmentReasonConfig[]>([]);
  const [reasonForm, setReasonForm] = useState<ReasonForm>(emptyReasonForm);
  const [reasonSearch, setReasonSearch] = useState("");
  const [reasonMessage, setReasonMessage] = useState("");
  const [reasonError, setReasonError] = useState("");
  const [isSavingReason, setIsSavingReason] = useState(false);

  const reloadReasons = useCallback(async () => {
    const loadedReasons = await loadAppointmentReasons();
    setReasons(loadedReasons);
    setReasonError("");
  }, []);

  const {
    refresh: refreshReasons,
    isRefreshing,
    lastUpdatedAt,
  } = useAutoRefresh({
    onRefresh: reloadReasons,
    pause: isSavingReason,
  });

  useEffect(() => {
    reloadReasons().catch(() =>
      setReasonError("No se pudieron cargar los motivos."),
    );
  }, [reloadReasons]);

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

  const hasListFilters = reasonSearch.trim().length > 0;

  function downloadVisibleReasons() {
    const fileName = hasListFilters
      ? "motivos-cita-filtrados.xls"
      : "motivos-cita.xls";

    downloadAppointmentReasonsExcel(filteredReasons, fileName);
  }

  function isSelectedReason(reason: AppointmentReasonConfig) {
    if (reasonForm.id && reason.id) {
      return reasonForm.id === reason.id;
    }

    return (
      reasonForm.label.trim().toLowerCase() === reason.label.trim().toLowerCase()
    );
  }

  function editReason(reason: AppointmentReasonConfig) {
    setReasonForm({
      id: reason.id ?? "",
      label: reason.label,
      allowsExecutiveAssignment: reason.allowsExecutiveAssignment,
      usesAppointmentDuration: reason.usesAppointmentDuration,
      appointmentDurationMinutes: reason.appointmentDurationMinutes || 30,
      usesServiceStartTime: reason.usesServiceStartTime,
      serviceStartTime: reason.serviceStartTime || "09:00",
      usesDateRange: reason.usesDateRange,
      usesPermitDetails: reason.usesPermitDetails,
      isActive: reason.isActive,
      restrictedWeekdays: reason.restrictedWeekdays,
      weekdayBusinessAdvance: reason.weekdayBusinessAdvance,
    });
    setReasonMessage("");
    setReasonError("");
  }

  function resetReasonForm() {
    setReasonForm(emptyReasonForm);
    setReasonMessage("");
    setReasonError("");
  }

  function toggleRestrictedWeekday(weekday: WeekdayKey) {
    setReasonForm((currentForm) => ({
      ...currentForm,
      restrictedWeekdays: currentForm.restrictedWeekdays.includes(weekday)
        ? currentForm.restrictedWeekdays.filter((item) => item !== weekday)
        : [...currentForm.restrictedWeekdays, weekday],
    }));
  }

  function updateWeekdayBusinessAdvance(
    weekday: WeekdayKey,
    patch: Partial<WeekdayBusinessAdvanceConfig[WeekdayKey]>,
  ) {
    setReasonForm((currentForm) => ({
      ...currentForm,
      weekdayBusinessAdvance: {
        ...currentForm.weekdayBusinessAdvance,
        [weekday]: {
          ...currentForm.weekdayBusinessAdvance[weekday],
          ...patch,
        },
      },
    }));
  }

  async function saveReason(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setReasonMessage("");
    setReasonError("");

    if (reasonForm.label.trim().length < 3) {
      setReasonError("Ingresa un nombre de motivo válido.");
      return;
    }

    for (const option of weekdayOptions) {
      const rule = reasonForm.weekdayBusinessAdvance[option.value];

      if (rule.enabled && rule.days < 1) {
        setReasonError("Ingresa días hábiles válidos para cada día activo.");
        return;
      }
    }

    if (
      reasonForm.allowsExecutiveAssignment &&
      reasonForm.usesAppointmentDuration &&
      reasonForm.appointmentDurationMinutes < 5
    ) {
      setReasonError("Ingresa una duración válida en minutos.");
      return;
    }

    if (
      reasonForm.allowsExecutiveAssignment &&
      reasonForm.usesServiceStartTime &&
      !/^([01]\d|2[0-3]):[0-5]\d$/.test(reasonForm.serviceStartTime)
    ) {
      setReasonError("Ingresa una hora de inicio válida para la atención.");
      return;
    }

    setIsSavingReason(true);

    try {
      const response = await fetch("/api/appointment-reasons", {
        ...adminFetchInit,
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
        <MaintainerPageHeader
          title="Motivos de cita"
          onRefresh={() => void refreshReasons()}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
        />

        <div className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25 sm:rounded-[24px]">
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-3">
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end lg:grid-cols-[1fr_auto_auto_auto]">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Buscar motivo
                  </span>
                  <input
                    type="search"
                    value={reasonSearch}
                    onChange={(event) => setReasonSearch(event.target.value)}
                    className="h-9 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                    placeholder="Nombre o código"
                  />
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-1 lg:col-span-3 lg:justify-end">
                  <button
                    type="button"
                    onClick={downloadVisibleReasons}
                    disabled={filteredReasons.length === 0}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-500 bg-white px-4 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 active:translate-y-px disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                  >
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-emerald-500 text-[9px] font-bold leading-none text-white">
                      X
                    </span>
                    Exportar a Excel
                  </button>
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
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#b7cce4] bg-white">
                <div className="grid grid-cols-[1.2fr_1fr_0.7fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0f2747]">
                  <span>Nombre</span>
                  <span>Características</span>
                  <span>Estado</span>
                </div>
                <div className="max-h-[70dvh] overflow-auto divide-y divide-[#c5d8eb]">
                  {filteredReasons.map((reason) => (
                    <button
                      key={reason.value}
                      type="button"
                      aria-selected={isSelectedReason(reason)}
                      onClick={() => editReason(reason)}
                      className={uiListRowClass(
                        isSelectedReason(reason),
                        "grid w-full grid-cols-[1.2fr_1fr_0.7fr] gap-2 px-3 py-2 text-left text-xs",
                      )}
                    >
                      <span>
                        <strong className="block text-[#0f2747]">
                          {reason.label}
                        </strong>
                        <span className="text-slate-500">{reason.value}</span>
                      </span>
                      <span className="text-slate-600">
                        {[
                          reason.allowsExecutiveAssignment
                            ? reason.usesAppointmentDuration
                              ? `Deriva · ${reason.appointmentDurationMinutes} min`
                              : "Deriva"
                            : "",
                          reason.usesDateRange ? "Fechas" : "",
                          reason.usesPermitDetails ? "Horas/días" : "",
                          reason.restrictedWeekdays.length
                            ? `Restringe: ${formatRestrictedWeekdays(reason.restrictedWeekdays)}`
                            : "",
                          formatBusinessDayAdvanceSummary(
                            reason.weekdayBusinessAdvance,
                          ),
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
              className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-4"
            >
              <div className="mb-4 border-b border-[#c5d8eb] pb-3">
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
                  className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  placeholder="Ej: Capacitación"
                />
              </label>

              <div className="mt-4 grid gap-2">
                <div className="overflow-hidden rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)]">
                  <label className="flex h-10 items-center justify-between px-3 text-xs font-semibold text-[#173b68]">
                    Derivar
                    <input
                      type="checkbox"
                      checked={reasonForm.allowsExecutiveAssignment}
                      onChange={(event) =>
                        setReasonForm((currentForm) => ({
                          ...currentForm,
                          allowsExecutiveAssignment: event.target.checked,
                          ...(event.target.checked
                            ? {}
                            : {
                                usesAppointmentDuration: false,
                                usesServiceStartTime: false,
                              }),
                        }))
                      }
                      className="h-4 w-4 accent-[#0b5cab]"
                    />
                  </label>

                  {reasonForm.allowsExecutiveAssignment ? (
                    <div className="border-t border-[#c5d8eb] bg-[#f8fbff] px-3 py-3">
                      <p className="text-xs font-semibold text-[#173b68]">
                        Duración de la cita
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        Define cuánto durará la atención al derivar.
                      </p>
                      <div className="mt-3 flex h-10 items-center gap-2 rounded-2xl border border-[#b7cce4] bg-white px-3">
                        <span className="shrink-0 text-[11px] font-semibold text-[#173b68]">
                          Minutos
                        </span>
                        <input
                          type="number"
                          min={5}
                          max={480}
                          step={5}
                          value={reasonForm.appointmentDurationMinutes}
                          disabled={!reasonForm.usesAppointmentDuration}
                          onChange={(event) =>
                            setReasonForm((currentForm) => ({
                              ...currentForm,
                              appointmentDurationMinutes:
                                Number.parseInt(event.target.value, 10) || 0,
                            }))
                          }
                          className="h-8 w-16 rounded-xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-2 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <label className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#173b68]">
                          Activo
                          <input
                            type="checkbox"
                            checked={reasonForm.usesAppointmentDuration}
                            onChange={(event) =>
                              setReasonForm((currentForm) => ({
                                ...currentForm,
                                usesAppointmentDuration: event.target.checked,
                              }))
                            }
                            className="h-3.5 w-3.5 accent-[#0b5cab]"
                          />
                        </label>
                      </div>

                      <p className="mt-4 text-xs font-semibold text-[#173b68]">
                        Hora de inicio de atención
                      </p>
                      <p className="mt-1 text-[11px] leading-5 text-slate-500">
                        Primera cita del día para este motivo. Las siguientes se
                        encadenan con 10 minutos de margen.
                      </p>
                      <div className="mt-3 flex h-10 items-center gap-2 rounded-2xl border border-[#b7cce4] bg-white px-3">
                        <span className="shrink-0 text-[11px] font-semibold text-[#173b68]">
                          Hora
                        </span>
                        <input
                          type="time"
                          value={reasonForm.serviceStartTime}
                          disabled={!reasonForm.usesServiceStartTime}
                          onChange={(event) =>
                            setReasonForm((currentForm) => ({
                              ...currentForm,
                              serviceStartTime: event.target.value,
                            }))
                          }
                          className="h-8 rounded-xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-2 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <label className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#173b68]">
                          Activo
                          <input
                            type="checkbox"
                            checked={reasonForm.usesServiceStartTime}
                            onChange={(event) =>
                              setReasonForm((currentForm) => ({
                                ...currentForm,
                                usesServiceStartTime: event.target.checked,
                                serviceStartTime: event.target.checked
                                  ? currentForm.serviceStartTime || "09:00"
                                  : "09:00",
                              }))
                            }
                            className="h-3.5 w-3.5 accent-[#0b5cab]"
                          />
                        </label>
                      </div>
                      {!reasonForm.usesServiceStartTime ? (
                        <p className="mt-2 text-[11px] leading-5 text-slate-500">
                          Inactivo: se usará las 09:00 como hora base para la
                          primera cita del día.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {reasonFeatureFields.map(([field, label]) => (
                  <label
                    key={field}
                    className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-xs font-semibold text-[#173b68]"
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

              <div className="mt-4 rounded-2xl border border-[#b7cce4] bg-white p-3">
                <p className="text-xs font-semibold text-[#173b68]">
                  Días restringidos
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Marca los días en que este motivo no puede solicitarse en
                  línea. Si la fecha elegida cae en uno de ellos, el conductor
                  verá que debe tramitarlo presencialmente en la oficina.
                </p>
                <div className="mt-2 flex flex-nowrap items-center justify-between gap-1 overflow-x-auto pb-0.5">
                  {weekdayOptions.map((option) => (
                    <label
                      key={option.value}
                      className="inline-flex min-w-[2.75rem] shrink-0 flex-col items-center gap-1 rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-2 py-2 text-[#173b68]"
                    >
                      <input
                        type="checkbox"
                        checked={reasonForm.restrictedWeekdays.includes(
                          option.value,
                        )}
                        onChange={() => toggleRestrictedWeekday(option.value)}
                        className="h-3.5 w-3.5 accent-[#0b5cab]"
                      />
                      <span className="text-[11px] font-semibold lowercase leading-none">
                        {option.shortLabel}
                      </span>
                    </label>
                  ))}
                </div>

                <p className="mt-4 text-xs font-semibold text-[#173b68]">
                  Anticipación por día hábil
                </p>
                <p className="mt-1 text-[11px] leading-5 text-slate-500">
                  Define cuántos días hábiles de anticipación exige cada día de
                  la semana según la fecha solicitada. Si un día está inactivo,
                  no aplica anticipación para solicitudes que caigan en ese día.
                </p>
                <div className="mt-2 grid gap-2">
                  {weekdayOptions.map((option) => (
                    <div
                      key={option.value}
                      className="flex h-10 items-center gap-2 rounded-2xl border border-[#b7cce4] bg-[#f8fbff] px-3"
                    >
                      <span className="w-8 shrink-0 text-[11px] font-semibold lowercase text-[#173b68]">
                        {option.shortLabel}
                      </span>
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={reasonForm.weekdayBusinessAdvance[option.value].days}
                        disabled={
                          !reasonForm.weekdayBusinessAdvance[option.value].enabled
                        }
                        onChange={(event) =>
                          updateWeekdayBusinessAdvance(option.value, {
                            days:
                              Number.parseInt(event.target.value, 10) || 0,
                          })
                        }
                        className="h-8 w-14 rounded-xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-2 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15 disabled:bg-slate-100 disabled:text-slate-400"
                      />
                      <label className="ml-auto inline-flex shrink-0 items-center gap-1.5 text-[11px] font-semibold text-[#173b68]">
                        Activo
                        <input
                          type="checkbox"
                          checked={
                            reasonForm.weekdayBusinessAdvance[option.value].enabled
                          }
                          onChange={(event) =>
                            updateWeekdayBusinessAdvance(option.value, {
                              enabled: event.target.checked,
                            })
                          }
                          className="h-3.5 w-3.5 accent-[#0b5cab]"
                        />
                      </label>
                    </div>
                  ))}
                </div>
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
