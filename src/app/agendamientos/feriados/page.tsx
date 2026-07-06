"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { DEFAULT_HOLIDAY_BUSINESS_DAYS_ADVANCE } from "@/lib/chile-holidays-2026";
import {
  type HolidayConfig,
  formatHolidayDateLabel,
} from "@/lib/holidays";
import { uiListRowClass } from "@/lib/ui-borders";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useCallback, useEffect, useMemo, useState } from "react";

type HolidayForm = {
  id: string;
  date: string;
  name: string;
  year: string;
  scope: string;
  businessDaysAdvance: string;
  isActive: boolean;
};

const emptyHolidayForm: HolidayForm = {
  id: "",
  date: "",
  name: "",
  year: String(new Date().getFullYear()),
  scope: "nacional",
  businessDaysAdvance: String(DEFAULT_HOLIDAY_BUSINESS_DAYS_ADVANCE),
  isActive: true,
};

async function loadHolidays(year?: number) {
  const query = year ? `?year=${year}` : "";
  const response = await fetch(`/api/holidays${query}`, { cache: "no-store" });

  if (!response.ok) {
    throw new Error("No se pudieron cargar los feriados.");
  }

  const data = (await response.json()) as { holidays?: HolidayConfig[] };
  return data.holidays ?? [];
}

function formatShortDate(dateValue: string) {
  return new Intl.DateTimeFormat("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(`${dateValue}T12:00:00`));
}

export default function FeriadosPage() {
  const [holidays, setHolidays] = useState<HolidayConfig[]>([]);
  const [selectedYear, setSelectedYear] = useState("2026");
  const [holidaySearch, setHolidaySearch] = useState("");
  const [holidayForm, setHolidayForm] = useState<HolidayForm>(emptyHolidayForm);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [holidayMessage, setHolidayMessage] = useState("");
  const [holidayError, setHolidayError] = useState("");
  const [isSavingHoliday, setIsSavingHoliday] = useState(false);
  const [isSeedingHolidays, setIsSeedingHolidays] = useState(false);

  const reloadHolidays = useCallback(async () => {
    const parsedYear = Number.parseInt(selectedYear, 10);
    const loadedHolidays = await loadHolidays(
      Number.isFinite(parsedYear) ? parsedYear : undefined,
    );
    setHolidays(loadedHolidays);
    setHolidayError("");
  }, [selectedYear]);

  const {
    refresh: refreshHolidays,
    isRefreshing,
    lastUpdatedAt,
  } = useAutoRefresh({
    onRefresh: reloadHolidays,
    pause: isSavingHoliday || isSeedingHolidays,
  });

  useEffect(() => {
    reloadHolidays().catch(() =>
      setHolidayError("No se pudieron cargar los feriados."),
    );
  }, [reloadHolidays]);

  const filteredHolidays = useMemo(() => {
    const normalizedSearch = holidaySearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return holidays;
    }

    return holidays.filter(
      (holiday) =>
        holiday.name.toLowerCase().includes(normalizedSearch) ||
        holiday.date.includes(normalizedSearch),
    );
  }, [holidaySearch, holidays]);

  function openCreateModal() {
    setHolidayForm({
      ...emptyHolidayForm,
      year: selectedYear || String(new Date().getFullYear()),
    });
    setHolidayMessage("");
    setHolidayError("");
    setIsModalOpen(true);
  }

  function openEditModal(holiday: HolidayConfig) {
    setHolidayForm({
      id: holiday.id,
      date: holiday.date,
      name: holiday.name,
      year: String(holiday.year),
      scope: holiday.scope,
      businessDaysAdvance: String(holiday.businessDaysAdvance),
      isActive: holiday.isActive,
    });
    setHolidayMessage("");
    setHolidayError("");
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setHolidayForm(emptyHolidayForm);
    setHolidayError("");
  }

  async function seedChile2026() {
    setHolidayMessage("");
    setHolidayError("");
    setIsSeedingHolidays(true);

    try {
      const response = await fetch("/api/holidays/seed", {
        method: "POST",
        credentials: "include",
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "No se pudieron cargar los feriados.");
      }

      await reloadHolidays();
      setSelectedYear("2026");
      setHolidayMessage(
        data.message ?? "Feriados nacionales de Chile 2026 cargados.",
      );
    } catch (error) {
      setHolidayError(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar los feriados de Chile 2026.",
      );
    } finally {
      setIsSeedingHolidays(false);
    }
  }

  async function saveHoliday(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setHolidayMessage("");
    setHolidayError("");

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(holidayForm.date.trim()) ||
      holidayForm.name.trim().length < 3
    ) {
      setHolidayError("Ingresa fecha y nombre válidos.");
      return;
    }

    const parsedAdvance = Number.parseInt(holidayForm.businessDaysAdvance, 10);

    if (!Number.isFinite(parsedAdvance) || parsedAdvance < 1) {
      setHolidayError("Ingresa días hábiles de anticipación válidos.");
      return;
    }

    setIsSavingHoliday(true);

    try {
      const response = await fetch("/api/holidays", {
        method: holidayForm.id ? "PATCH" : "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: holidayForm.id || undefined,
          date: holidayForm.date,
          name: holidayForm.name.trim(),
          year: Number.parseInt(holidayForm.year, 10) || Number.parseInt(holidayForm.date.slice(0, 4), 10),
          scope: holidayForm.scope.trim() || "nacional",
          businessDaysAdvance: parsedAdvance,
          isActive: holidayForm.isActive,
        }),
      });

      const data = (await response.json()) as { message?: string };

      if (!response.ok) {
        throw new Error(data.message ?? "No se pudo guardar el feriado.");
      }

      await reloadHolidays();
      setHolidayMessage("Feriado guardado correctamente.");
      closeModal();
    } catch (error) {
      setHolidayError(
        error instanceof Error ? error.message : "No se pudo guardar el feriado.",
      );
    } finally {
      setIsSavingHoliday(false);
    }
  }

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader
          title="Feriados"
          subtitle="Calendario nacional"
          onRefresh={() => void refreshHolidays()}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
          actions={
            <button
              type="button"
              onClick={() => void seedChile2026()}
              disabled={isSeedingHolidays}
              className="inline-flex h-9 items-center justify-center rounded-2xl border border-[#0b5cab] bg-white px-4 text-xs font-semibold text-[#0b5cab] transition hover:bg-[#eef5fc] active:translate-y-px disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSeedingHolidays
                ? "Cargando Chile 2026..."
                : "Importar Chile 2026"}
            </button>
          }
        />

        {holidayMessage ? (
          <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">
            {holidayMessage}
          </p>
        ) : null}

        {holidayError && !isModalOpen ? (
          <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            {holidayError}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25 sm:rounded-[24px]">
          <div className="p-4">
            <div className="mb-3 grid gap-2 sm:grid-cols-[120px_1fr_auto_auto] sm:items-end">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#173b68]">Año</span>
                <select
                  value={selectedYear}
                  onChange={(event) => setSelectedYear(event.target.value)}
                  className="h-9 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                >
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#173b68]">
                  Buscar feriado
                </span>
                <input
                  type="search"
                  value={holidaySearch}
                  onChange={(event) => setHolidaySearch(event.target.value)}
                  className="h-9 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  placeholder="Nombre o fecha"
                />
              </label>
              <button
                type="button"
                onClick={() => setHolidaySearch("")}
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c]"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={openCreateModal}
                className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c]"
              >
                Nuevo feriado
              </button>
            </div>

            <p className="mb-3 text-xs leading-relaxed text-slate-600">
              Los feriados activos bloquean solicitudes en línea para esas fechas
              (vacaciones, permisos, citas). El conductor verá el mensaje general
              de tramitación en oficinas. Los días hábiles de anticipación se usan
              al calcular plazos y quedan registrados por feriado (por defecto 15).
            </p>

            <div className="overflow-hidden rounded-2xl border border-[#b7cce4] bg-white">
              <div className="grid grid-cols-[1fr_1.2fr_0.8fr_0.7fr_0.6fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0f2747]">
                <span>Fecha</span>
                <span>Nombre</span>
                <span>Alcance</span>
                <span>Anticipación</span>
                <span>Estado</span>
              </div>
              <div className="max-h-[70dvh] overflow-auto divide-y divide-[#c5d8eb]">
                {filteredHolidays.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">
                    No hay feriados para este año. Usa &quot;Importar Chile 2026&quot;
                    para cargar el calendario nacional.
                  </p>
                ) : (
                  filteredHolidays.map((holiday) => (
                    <button
                      key={holiday.id}
                      type="button"
                      onClick={() => openEditModal(holiday)}
                      className={uiListRowClass(
                        false,
                        "grid w-full grid-cols-[1fr_1.2fr_0.8fr_0.7fr_0.6fr] gap-2 px-3 py-2 text-left text-xs",
                      )}
                    >
                      <span className="text-[#0f2747]">
                        <strong className="block">{formatShortDate(holiday.date)}</strong>
                        <span className="text-slate-500">{holiday.date}</span>
                      </span>
                      <span className="text-slate-700">{holiday.name}</span>
                      <span className="capitalize text-slate-600">{holiday.scope}</span>
                      <span className="font-semibold text-[#0b5cab]">
                        {holiday.businessDaysAdvance} días háb.
                      </span>
                      <span
                        className={
                          holiday.isActive
                            ? "font-semibold text-emerald-600"
                            : "text-slate-400"
                        }
                      >
                        {holiday.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      {isModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="holiday-modal-title"
            className="w-full max-w-lg overflow-hidden rounded-[24px] border border-[#b7cce4] bg-white shadow-2xl"
          >
            <div className="border-b border-[#c5d8eb] bg-[#d7e7f8] px-5 py-4">
              <h2
                id="holiday-modal-title"
                className="font-heading text-lg font-semibold text-[#0f2747]"
              >
                {holidayForm.id ? "Editar feriado" : "Nuevo feriado"}
              </h2>
              <p className="mt-1 text-xs text-slate-600">
                Las solicitudes en línea para esta fecha quedarán restringidas.
              </p>
            </div>

            <form onSubmit={saveHoliday} className="space-y-4 p-5">
              {holidayError ? (
                <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                  {holidayError}
                </p>
              ) : null}

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#173b68]">Fecha</span>
                <input
                  type="date"
                  required
                  value={holidayForm.date}
                  onChange={(event) =>
                    setHolidayForm((current) => ({
                      ...current,
                      date: event.target.value,
                      year: event.target.value.slice(0, 4) || current.year,
                    }))
                  }
                  className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                />
                {holidayForm.date ? (
                  <span className="text-xs text-slate-500">
                    {formatHolidayDateLabel(holidayForm.date)}
                  </span>
                ) : null}
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#173b68]">Nombre</span>
                <input
                  type="text"
                  required
                  value={holidayForm.name}
                  onChange={(event) =>
                    setHolidayForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  placeholder="Ej. Independencia Nacional"
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">Año</span>
                  <input
                    type="number"
                    min={2020}
                    max={2100}
                    value={holidayForm.year}
                    onChange={(event) =>
                      setHolidayForm((current) => ({
                        ...current,
                        year: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Días hábiles anticipación
                  </span>
                  <input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={holidayForm.businessDaysAdvance}
                    onChange={(event) =>
                      setHolidayForm((current) => ({
                        ...current,
                        businessDaysAdvance: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                  />
                </label>
              </div>

              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-semibold text-[#173b68]">Alcance</span>
                <select
                  value={holidayForm.scope}
                  onChange={(event) =>
                    setHolidayForm((current) => ({
                      ...current,
                      scope: event.target.value,
                    }))
                  }
                  className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                >
                  <option value="nacional">Nacional</option>
                  <option value="regional">Regional</option>
                  <option value="empresa">Empresa</option>
                </select>
              </label>

              <label className="inline-flex items-center gap-2 text-sm text-[#0f2747]">
                <input
                  type="checkbox"
                  checked={holidayForm.isActive}
                  onChange={(event) =>
                    setHolidayForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                  className="h-4 w-4 rounded border-[#9fb8d9] text-[#0b5cab] focus:ring-[#0b5cab]/20"
                />
                Activo (restringe solicitudes en línea)
              </label>

              <div className="flex flex-wrap justify-end gap-2 border-t border-[#c5d8eb] pt-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="inline-flex h-10 items-center justify-center rounded-2xl border border-[#9fb8d9] bg-white px-5 text-sm font-semibold text-[#173b68] transition hover:bg-[#f8fbff]"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingHoliday}
                  className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white transition hover:bg-[#084a8c] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingHoliday ? "Guardando..." : "Guardar feriado"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
