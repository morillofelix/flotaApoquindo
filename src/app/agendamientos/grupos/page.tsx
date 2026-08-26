"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { adminFetchInit } from "@/lib/admin-fetch";
import { loadDriverGroups } from "@/lib/agendamientos-admin";
import { type DriverGroupConfig } from "@/lib/driver-groups";
import { uiListRowClass } from "@/lib/ui-borders";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { useCallback, useEffect, useMemo, useState } from "react";

type GroupForm = {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
};

const emptyForm: GroupForm = {
  id: "",
  code: "",
  name: "",
  isActive: true,
};

export default function GruposPage() {
  const [groups, setGroups] = useState<DriverGroupConfig[]>([]);
  const [form, setForm] = useState<GroupForm>(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const reload = useCallback(async () => {
    const loaded = await loadDriverGroups();
    setGroups(loaded);
    setError("");
  }, []);

  const { refresh, isRefreshing, lastUpdatedAt } = useAutoRefresh({
    onRefresh: reload,
    pause: isSaving,
  });

  useEffect(() => {
    reload().catch(() => setError("No se pudieron cargar los grupos."));
  }, [reload]);

  const filtered = useMemo(() => {
    const normalized = search.trim().toLowerCase();

    if (!normalized) {
      return groups;
    }

    return groups.filter(
      (group) =>
        group.code.toLowerCase().includes(normalized) ||
        group.name.toLowerCase().includes(normalized),
    );
  }, [groups, search]);

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault();
    setIsSaving(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/driver-groups", {
        ...adminFetchInit,
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = (await response.json()) as {
        message?: string;
        group?: DriverGroupConfig;
      };

      if (!response.ok) {
        throw new Error(data.message || "No se pudo guardar el grupo.");
      }

      await reload();
      setForm(emptyForm);
      setMessage(form.id ? "Grupo actualizado." : "Grupo creado.");
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "No se pudo guardar el grupo.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  function resetForm() {
    setForm(emptyForm);
    setMessage("");
    setError("");
  }

  return (
    <main className="mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6">
      <MaintainerPageHeader
        title="Grupos"
        subtitle="Flota"
        onRefresh={() => void refresh()}
        isRefreshing={isRefreshing}
        lastUpdatedAt={lastUpdatedAt}
      />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(320px,0.9fr)]">
        <section className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25">
          <div className="border-b border-[#c5d8eb] bg-[#eef3f9] px-4 py-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">Buscar</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Código o nombre"
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              />
            </label>
          </div>

          <div className="overflow-hidden">
            <div className="grid grid-cols-[1.2fr_1fr_0.7fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#0f2747]">
              <span>Nombre</span>
              <span>Detalle</span>
              <span>Estado</span>
            </div>
            <div className="max-h-[70dvh] overflow-auto divide-y divide-[#c5d8eb]">
              {filtered.map((group) => (
                <button
                  key={group.id}
                  type="button"
                  aria-selected={form.id === group.id}
                  onClick={() =>
                    setForm({
                      id: group.id,
                      code: group.code,
                      name: group.name,
                      isActive: group.isActive,
                    })
                  }
                  className={uiListRowClass(
                    form.id === group.id,
                    "grid w-full grid-cols-[1.2fr_1fr_0.7fr] gap-2 px-3 py-2 text-left text-xs",
                  )}
                >
                  <span>
                    <strong className="block text-[#0f2747]">{group.name}</strong>
                    <span className="text-slate-500">{group.code}</span>
                  </span>
                  <span className="text-slate-600">
                    {group.driversCount ?? 0} conductores ·{" "}
                    {group.subgroupsCount ?? 0} subgrupos
                  </span>
                  <span
                    className={`w-fit rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      group.isActive
                        ? "bg-green-50 text-green-700"
                        : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {group.isActive ? "Activo" : "Inactivo"}
                  </span>
                </button>
              ))}
              {!filtered.length ? (
                <p className="px-4 py-8 text-center text-sm text-slate-500">
                  No hay grupos para mostrar.
                </p>
              ) : null}
            </div>
          </div>
        </section>

        <section className="rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-4 shadow-lg shadow-slate-300/20">
          <h2 className="font-heading text-lg font-semibold text-[#0f2747]">
            {form.id ? "Editar grupo" : "Nuevo grupo"}
          </h2>
          <form onSubmit={saveGroup} className="mt-4 grid gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">Código</span>
              <input
                required
                value={form.code}
                onChange={(event) =>
                  setForm((current) => ({ ...current, code: event.target.value }))
                }
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm uppercase text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-semibold text-[#173b68]">Nombre</span>
              <input
                required
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                className="h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15"
              />
            </label>
            <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68]">
              Activo
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    isActive: event.target.checked,
                  }))
                }
                className="h-4 w-4 accent-[#0b5cab]"
              />
            </label>

            {message ? (
              <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {message}
              </p>
            ) : null}
            {error ? (
              <p className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-1 flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white transition hover:bg-[#084a8c] active:translate-y-px disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {isSaving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear"}
              </button>
            </div>
          </form>
        </section>
      </div>
    </main>
  );
}
