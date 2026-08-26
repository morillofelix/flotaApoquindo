"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { adminFetchInit } from "@/lib/admin-fetch";
import { loadBlockReasons } from "@/lib/agendamientos-admin";
import type { BlockReasonConfig } from "@/lib/block-reasons";
import { uiListRowClass } from "@/lib/ui-borders";
import { useCallback, useEffect, useMemo, useState } from "react";

type Form = Pick<BlockReasonConfig, "id" | "code" | "name" | "requiresManualUnlock" | "blocksAllServices" | "blocksLongTripsOnly" | "isActive" | "sortOrder">;
const empty: Form = { id: "", code: "", name: "", requiresManualUnlock: false, blocksAllServices: true, blocksLongTripsOnly: false, isActive: true, sortOrder: 0 };
const inputClass = "h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

export default function MotivosBloqueoPage() {
  const [reasons, setReasons] = useState<BlockReasonConfig[]>([]);
  const [form, setForm] = useState<Form>(empty);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reload = useCallback(async () => { setReasons(await loadBlockReasons()); setError(""); }, []);
  const { refresh, isRefreshing, lastUpdatedAt } = useAutoRefresh({ onRefresh: reload, pause: saving });
  useEffect(() => { reload().catch(() => setError("No se pudieron cargar los motivos de bloqueo.")); }, [reload]);
  const filtered = useMemo(() => { const value = search.trim().toLowerCase(); return value ? reasons.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(value)) : reasons; }, [reasons, search]);
  function edit(item: BlockReasonConfig) { setForm({ id: item.id, code: item.code, name: item.name, requiresManualUnlock: item.requiresManualUnlock, blocksAllServices: item.blocksAllServices, blocksLongTripsOnly: item.blocksLongTripsOnly, isActive: item.isActive, sortOrder: item.sortOrder }); setMessage(""); setError(""); }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/block-reasons", { ...adminFetchInit, method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo guardar el motivo.");
      await reload(); setForm(empty); setMessage(form.id ? "Motivo actualizado." : "Motivo creado.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar el motivo."); }
    finally { setSaving(false); }
  }
  return <main className="mx-auto w-full max-w-[1200px] px-3 py-4 sm:px-6">
    <MaintainerPageHeader title="Motivos de bloqueo" subtitle="Flota" onRefresh={() => void refresh()} isRefreshing={isRefreshing} lastUpdatedAt={lastUpdatedAt} />
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(350px,.9fr)]">
      <section className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25">
        <div className="border-b border-[#c5d8eb] bg-[#eef3f9] p-4"><Field label="Buscar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código o nombre" className={inputClass} /></Field></div>
        <div className="grid grid-cols-[1.2fr_1fr_.6fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#0f2747]"><span>Motivo</span><span>Alcance</span><span>Estado</span></div>
        <div className="max-h-[70dvh] divide-y divide-[#c5d8eb] overflow-auto">{filtered.map((item) => <button key={item.id} type="button" onClick={() => edit(item)} className={uiListRowClass(form.id === item.id, "grid w-full grid-cols-[1.2fr_1fr_.6fr] gap-2 px-3 py-2 text-left text-xs")}><span><strong className="block text-[#0f2747]">{item.name}</strong><span className="text-slate-500">{item.code}</span></span><span className="text-slate-600">{item.blocksLongTripsOnly ? "Solo viajes largos" : item.blocksAllServices ? "Todos los servicios" : "Informativo"}{item.requiresManualUnlock ? " · desbloqueo manual" : ""}</span><span className={item.isActive ? "text-green-700" : "text-slate-500"}>{item.isActive ? "Activo" : "Inactivo"}</span></button>)}{!filtered.length && <p className="p-8 text-center text-sm text-slate-500">No hay motivos para mostrar.</p>}</div>
      </section>
      <form onSubmit={save} className="rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-4 shadow-lg shadow-slate-300/20">
        <h2 className="font-heading text-lg font-semibold text-[#0f2747]">{form.id ? "Editar motivo" : "Nuevo motivo"}</h2>
        <div className="mt-4 grid gap-3">
          <Field label="Código"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={`${inputClass} uppercase`} /></Field>
          <Field label="Nombre"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
          <Field label="Orden"><input type="number" min={0} value={form.sortOrder} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} className={inputClass} /></Field>
          <Check label="Requiere desbloqueo manual" checked={form.requiresManualUnlock} onChange={(value) => setForm({ ...form, requiresManualUnlock: value })} />
          <Check label="Bloquea todos los servicios" checked={form.blocksAllServices} onChange={(value) => setForm({ ...form, blocksAllServices: value, blocksLongTripsOnly: value ? false : form.blocksLongTripsOnly })} />
          <Check label="Solo bloquea viajes largos" checked={form.blocksLongTripsOnly} onChange={(value) => setForm({ ...form, blocksLongTripsOnly: value, blocksAllServices: value ? false : form.blocksAllServices })} />
          <Check label="Activo" checked={form.isActive} onChange={(value) => setForm({ ...form, isActive: value })} />
        </div>
        {message && <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p>}
        {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setForm(empty); setMessage(""); setError(""); }} className="h-10 rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white">Cancelar</button><button disabled={saving} className="h-10 rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear"}</button></div>
      </form>
    </div>
  </main>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-[#173b68]">{label}</span>{children}</label>; }
function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex h-10 items-center justify-between rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68]">{label}<input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#0b5cab]" /></label>; }
