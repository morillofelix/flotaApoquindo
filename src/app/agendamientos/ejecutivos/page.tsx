"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { type ExecutiveConfig, defaultExecutives } from "@/lib/appointments";
import {
  downloadExecutivesExcel,
  loadExecutives,
} from "@/lib/agendamientos-admin";
import { uiListRowClass } from "@/lib/ui-borders";
import { useEffect, useMemo, useState } from "react";

type ExecutiveForm = {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  dailyLimitEnabled: boolean;
  dailyLimitMax: string;
};

const emptyExecutiveForm: ExecutiveForm = {
  id: "",
  name: "",
  email: "",
  isActive: true,
  dailyLimitEnabled: false,
  dailyLimitMax: "",
};

export default function EjecutivosPage() {
  const [executiveOptions, setExecutiveOptions] =
    useState<ExecutiveConfig[]>(defaultExecutives);
  const [executiveForm, setExecutiveForm] =
    useState<ExecutiveForm>(emptyExecutiveForm);
  const [executiveSearch, setExecutiveSearch] = useState("");
  const [executiveMessage, setExecutiveMessage] = useState("");
  const [executiveError, setExecutiveError] = useState("");
  const [isSavingExecutive, setIsSavingExecutive] = useState(false);

  useEffect(() => {
    loadExecutives()
      .then((loadedExecutives) => setExecutiveOptions(loadedExecutives))
      .catch(() => setExecutiveError("No se pudieron cargar los ejecutivos."));
  }, []);

  const filteredExecutives = useMemo(() => {
    const normalizedSearch = executiveSearch.trim().toLowerCase();

    if (!normalizedSearch) {
      return executiveOptions;
    }

    return executiveOptions.filter(
      (executive) =>
        executive.name.toLowerCase().includes(normalizedSearch) ||
        executive.email.toLowerCase().includes(normalizedSearch),
    );
  }, [executiveOptions, executiveSearch]);

  const hasListFilters = executiveSearch.trim().length > 0;

  function downloadVisibleExecutives() {
    const fileName = hasListFilters
      ? "ejecutivos-filtrados.xls"
      : "ejecutivos.xls";

    downloadExecutivesExcel(filteredExecutives, fileName);
  }

  const selectedExecutiveId =
    executiveForm.id ||
    executiveOptions.find(
      (executive) =>
        executive.name.trim().toLowerCase() ===
        executiveForm.name.trim().toLowerCase(),
    )?.id ||
    "";

  function isSelectedExecutive(executive: ExecutiveConfig) {
    if (executiveForm.id && executive.id) {
      return executiveForm.id === executive.id;
    }

    return (
      executiveForm.name.trim().toLowerCase() ===
      executive.name.trim().toLowerCase()
    );
  }

  function editExecutive(executive: ExecutiveConfig) {
    setExecutiveForm({
      id: executive.id ?? "",
      name: executive.name,
      email: executive.email,
      isActive: executive.isActive,
      dailyLimitEnabled: executive.dailyLimitEnabled,
      dailyLimitMax:
        executive.dailyLimitMax !== null ? String(executive.dailyLimitMax) : "",
    });
    setExecutiveMessage("");
    setExecutiveError("");
  }

  function resetExecutiveForm() {
    setExecutiveForm(emptyExecutiveForm);
    setExecutiveMessage("");
    setExecutiveError("");
  }

  async function saveExecutive(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setExecutiveMessage("");
    setExecutiveError("");

    if (
      executiveForm.name.trim().length < 3 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(executiveForm.email.trim())
    ) {
      setExecutiveError("Ingresa nombre y correo válido.");
      return;
    }

    if (executiveForm.dailyLimitEnabled) {
      const parsedMax = Number(executiveForm.dailyLimitMax);

      if (!Number.isFinite(parsedMax) || parsedMax < 1) {
        setExecutiveError(
          "Ingresa una cantidad máxima válida cuando el tope diario está activo.",
        );
        return;
      }
    }

    setIsSavingExecutive(true);

    try {
      const response = await fetch("/api/executives", {
        method: selectedExecutiveId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          id: selectedExecutiveId,
          name: executiveForm.name,
          email: executiveForm.email,
          isActive: executiveForm.isActive,
          dailyLimitEnabled: executiveForm.dailyLimitEnabled,
          dailyLimitMax: executiveForm.dailyLimitEnabled
            ? Number(executiveForm.dailyLimitMax)
            : null,
        }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(data?.message ?? "No se pudo guardar el ejecutivo.");
      }

      const loadedExecutives = await loadExecutives();
      setExecutiveOptions(loadedExecutives);
      setExecutiveForm(emptyExecutiveForm);
      setExecutiveMessage("Ejecutivo guardado correctamente.");
    } catch (error) {
      setExecutiveError(
        error instanceof Error
          ? error.message
          : "No se pudo guardar el ejecutivo.",
      );
    } finally {
      setIsSavingExecutive(false);
    }
  }

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader title="Ejecutivos" />

        <div className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25 sm:rounded-[24px]">
          <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
            <div className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-3">
              <div className="mb-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end lg:grid-cols-[1fr_auto_auto_auto]">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Buscar ejecutivo
                  </span>
                  <input
                    type="search"
                    value={executiveSearch}
                    onChange={(event) => setExecutiveSearch(event.target.value)}
                    className="h-9 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition placeholder:text-slate-400 focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                    placeholder="Nombre o correo"
                  />
                </label>
                <div className="flex flex-wrap gap-2 sm:col-span-1 lg:col-span-3 lg:justify-end">
                  <button
                    type="button"
                    onClick={downloadVisibleExecutives}
                    disabled={filteredExecutives.length === 0}
                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-emerald-500 bg-white px-4 text-xs font-semibold text-emerald-600 transition hover:bg-emerald-50 active:translate-y-px disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400"
                  >
                    <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-sm bg-emerald-500 text-[9px] font-bold leading-none text-white">
                      X
                    </span>
                    Exportar a Excel
                  </button>
                  <button
                    type="button"
                    onClick={() => setExecutiveSearch("")}
                    className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                  >
                    Limpiar
                  </button>
                  <button
                    type="button"
                    onClick={resetExecutiveForm}
                    className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                  >
                    Nuevo
                  </button>
                </div>
              </div>

              <div className="overflow-hidden rounded-2xl border border-[#b7cce4] bg-white">
                <div className="grid grid-cols-[1fr_1.2fr_0.6fr_0.7fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0f2747]">
                  <span>Nombre</span>
                  <span>Correo</span>
                  <span>Estado</span>
                  <span>Tope día</span>
                </div>
                <div className="max-h-[70dvh] overflow-auto divide-y divide-[#c5d8eb]">
                  {filteredExecutives.map((executive) => (
                    <button
                      key={executive.name}
                      type="button"
                      aria-selected={isSelectedExecutive(executive)}
                      onClick={() => editExecutive(executive)}
                      className={uiListRowClass(
                        isSelectedExecutive(executive),
                        "grid w-full grid-cols-[1fr_1.2fr_0.6fr_0.7fr] gap-2 px-3 py-2 text-left text-xs",
                      )}
                    >
                      <strong className="text-[#0f2747]">{executive.name}</strong>
                      <span className="break-words text-slate-600">
                        {executive.email || "Sin correo"}
                      </span>
                      <span
                        className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          executive.isActive
                            ? "bg-green-50 text-green-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {executive.isActive ? "Activo" : "Inactivo"}
                      </span>
                      <span
                        className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          executive.dailyLimitEnabled
                            ? "bg-amber-50 text-amber-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {executive.dailyLimitEnabled
                          ? `Máx. ${executive.dailyLimitMax ?? 0}`
                          : "Sin tope"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <form
              noValidate
              onSubmit={saveExecutive}
              className="rounded-2xl border border-[#b7cce4] bg-[#f8fbff] p-4"
            >
              <div className="mb-4 border-b border-[#c5d8eb] pb-3">
                <h4 className="font-heading text-base font-semibold text-[#0f2747]">
                  Datos generales
                </h4>
                <p className="text-xs text-slate-500">
                  Define quién puede recibir derivaciones y correos Outlook.
                </p>
              </div>

              <div className="grid gap-3">
                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Nombre ejecutivo
                  </span>
                  <input
                    type="text"
                    value={executiveForm.name}
                    onChange={(event) =>
                      setExecutiveForm((currentForm) => ({
                        ...currentForm,
                        name: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                    placeholder="Ej: Félix Morillo"
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-xs font-semibold text-[#173b68]">
                    Correo ejecutivo
                  </span>
                  <input
                    type="email"
                    value={executiveForm.email}
                    onChange={(event) =>
                      setExecutiveForm((currentForm) => ({
                        ...currentForm,
                        email: event.target.value,
                      }))
                    }
                    className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                    placeholder="correo@transportesapoquindo.cl"
                  />
                </label>

                <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-xs font-semibold text-[#173b68]">
                  Activo
                  <input
                    type="checkbox"
                    checked={executiveForm.isActive}
                    onChange={(event) =>
                      setExecutiveForm((currentForm) => ({
                        ...currentForm,
                        isActive: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 accent-[#0b5cab]"
                  />
                </label>

                <div className="rounded-2xl border border-[#b7cce4] bg-white p-3 shadow-[0_1px_2px_rgba(15,39,71,0.04)]">
                  <div className="mb-3 border-b border-[#c5d8eb] pb-2">
                    <h5 className="text-xs font-semibold uppercase tracking-[0.12em] text-[#0b5cab]">
                      Tope diario de citas
                    </h5>
                    <p className="mt-1 text-[11px] leading-5 text-slate-500">
                      Limita cuántas solicitudes puede recibir este ejecutivo
                      en un mismo día, sumando todos los motivos.
                    </p>
                  </div>

                  <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-[#f8fbff] px-3 text-xs font-semibold text-[#173b68]">
                    Activar límite diario
                    <input
                      type="checkbox"
                      checked={executiveForm.dailyLimitEnabled}
                      onChange={(event) =>
                        setExecutiveForm((currentForm) => ({
                          ...currentForm,
                          dailyLimitEnabled: event.target.checked,
                          dailyLimitMax: event.target.checked
                            ? currentForm.dailyLimitMax
                            : "",
                        }))
                      }
                      className="h-4 w-4 accent-[#0b5cab]"
                    />
                  </label>

                  {executiveForm.dailyLimitEnabled ? (
                    <label className="mt-3 flex flex-col gap-1.5">
                      <span className="text-xs font-semibold text-[#173b68]">
                        Cantidad máxima por día
                      </span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        required
                        value={executiveForm.dailyLimitMax}
                        onChange={(event) =>
                          setExecutiveForm((currentForm) => ({
                            ...currentForm,
                            dailyLimitMax: event.target.value,
                          }))
                        }
                        className="h-10 rounded-2xl border border-[#9fb8d9] bg-white shadow-[0_1px_2px_rgba(15,39,71,0.05)] px-3 text-sm text-[#0f2747] outline-none transition focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
                        placeholder="Ej: 5"
                      />
                    </label>
                  ) : (
                    <p className="mt-3 rounded-2xl border border-dashed border-[#c5d8eb] bg-[#f8fbff] px-3 py-2 text-[11px] leading-5 text-slate-500">
                      Sin límite activo. Este ejecutivo puede recibir todas las
                      citas del día.
                    </p>
                  )}
                </div>
              </div>

              {executiveMessage ? (
                <p className="mt-3 text-xs font-semibold text-green-700">
                  {executiveMessage}
                </p>
              ) : null}
              {executiveError ? (
                <p className="mt-3 text-xs font-semibold text-red-600">
                  {executiveError}
                </p>
              ) : null}

              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetExecutiveForm}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingExecutive}
                  className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-xs font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  {selectedExecutiveId ? "Actualizar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      </section>
    </main>
  );
}
