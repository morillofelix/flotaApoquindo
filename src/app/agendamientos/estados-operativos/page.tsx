"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { adminFetchInit } from "@/lib/admin-fetch";
import { loadOperationalStatuses } from "@/lib/agendamientos-admin";
import type { OperationalStatusConfig } from "@/lib/operational-status";
import { uiListRowClass } from "@/lib/ui-borders";
import { useCallback, useEffect, useMemo, useState } from "react";

type Form = Pick<OperationalStatusConfig, "id" | "code" | "name" | "color" | "priority" | "indicatesAvailability" | "blocksAssignments" | "isActive">;
const empty: Form = { id: "", code: "", name: "", color: "#0b5cab", priority: 0, indicatesAvailability: false, blocksAssignments: false, isActive: true };
const inputClass = "h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

export default function EstadosOperativosPage() {
  const [statuses, setStatuses] = useState<OperationalStatusConfig[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reload = useCallback(async () => { setStatuses(await loadOperationalStatuses()); setError(""); }, []);
  const { refresh, isRefreshing, lastUpdatedAt } = useAutoRefresh({ onRefresh: reload, pause: saving });
  useEffect(() => { reload().catch(() => setError("No se pudieron cargar los estados operativos.")); }, [reload]);
  const filtered = useMemo(() => { const value = search.trim().toLowerCase(); return value ? statuses.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(value)) : statuses; }, [search, statuses]);
  function edit(item: OperationalStatusConfig) { setForm({ id: item.id, code: item.code, name: item.name, color: item.color, priority: item.priority, indicatesAvailability: item.indicatesAvailability, blocksAssignments: item.blocksAssignments, isActive: item.isActive }); setMessage(""); setError(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form.id) { setError("Selecciona un estado de la lista para editarlo."); return; }
    setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/operational-statuses", { ...adminFetchInit, method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo guardar el estado.");
      await reload(); setForm(empty); setMessage("Estado operativo actualizado.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar el estado."); }
    finally { setSaving(false); }
  }
  return <main className="mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6">
    <MaintainerPageHeader title="Estados operativos" subtitle="Flota" onRefresh={() => void refresh()} isRefreshing={isRefreshing} lastUpdatedAt={lastUpdatedAt} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(340px,.9fr)]">
      <section className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25">
        <div className="border-b border-[#c5d8eb] bg-[#eef3f9] p-4"><Field label="Buscar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código o nombre" className={inputClass} /></Field></div>
        <div className="grid grid-cols-[1.2fr_.8fr_.7fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#0f2747]"><span>Estado</span><span>Comportamiento</span><span>Estado</span></div>
        <div className="max-h-[70dvh] divide-y divide-[#c5d8eb] overflow-auto">{filtered.map((item) => <button key={item.id} type="button" onClick={() => edit(item)} className={uiListRowClass(form.id === item.id, "grid w-full grid-cols-[1.2fr_.8fr_.7fr] gap-2 px-3 py-2 text-left text-xs")}><span><strong className="flex items-center gap-2 text-[#0f2747]"><i className="h-3 w-3 rounded-full" style={{ background: item.color }} />{item.name}</strong><span className="text-slate-500">{item.code}</span></span><span className="text-slate-600">{item.blocksAssignments ? "Bloquea" : item.indicatesAvailability ? "Disponible" : "No disponible"} · P{item.priority}</span><span className={item.isActive ? "text-green-700" : "text-slate-500"}>{item.isActive ? "Activo" : "Inactivo"}</span></button>)}</div>
      </section>
      <form onSubmit={save} className="rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-4 shadow-lg shadow-slate-300/20">
        <h2 className="font-heading text-lg font-semibold text-[#0f2747]">Editar estado</h2>
        <p className="mt-1 text-xs text-slate-500">Los estados son definidos por el sistema; selecciona uno para modificarlo.</p>
        <div className="mt-4 grid gap-3">
          <Field label="Código"><input readOnly value={form.code} placeholder="Selecciona un estado" className={`${inputClass} bg-slate-100 uppercase`} /></Field>
          <Field label="Nombre"><input required disabled={!form.id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
          <div className="grid grid-cols-2 gap-3"><Field label="Color"><input type="color" disabled={!form.id} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} className={`${inputClass} w-full p-1`} /></Field><Field label="Prioridad"><input type="number" disabled={!form.id} value={form.priority} onChange={(e) => setForm({ ...form, priority: Number(e.target.value) })} className={inputClass} /></Field></div>
          <Check label="Indica disponibilidad" checked={form.indicatesAvailability} disabled={!form.id} onChange={(value) => setForm({ ...form, indicatesAvailability: value })} />
          <Check label="Bloquea asignaciones" checked={form.blocksAssignments} disabled={!form.id} onChange={(value) => setForm({ ...form, blocksAssignments: value })} />
          <Check label="Activo" checked={form.isActive} disabled={!form.id} onChange={(value) => setForm({ ...form, isActive: value })} />
        </div>
        {message && <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p>}
        {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setForm(empty); setMessage(""); setError(""); }} className="h-10 rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white">Cancelar</button><button disabled={saving || !form.id} className="h-10 rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? "Guardando..." : "Guardar cambios"}</button></div>
      </form>
    </div>
  </main>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-[#173b68]">{label}</span>{children}</label>; }
function Check({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) { return <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68]">{label}<input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#0b5cab]" /></label>; }
