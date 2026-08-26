"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import { adminFetchInit } from "@/lib/admin-fetch";
import { loadOperationalStatuses, loadShiftPatterns } from "@/lib/agendamientos-admin";
import type { OperationalStatusConfig } from "@/lib/operational-status";
import type { ShiftPatternConfig, ShiftPatternDayConfig } from "@/lib/shift-patterns";
import { uiListRowClass } from "@/lib/ui-borders";
import { useCallback, useEffect, useMemo, useState } from "react";

type Form = {
  id: string; code: string; name: string; description: string; cycleLengthDays: number;
  baseDate: string; holidayApplication: string; weekendApplication: string;
  isActive: boolean; days: ShiftPatternDayConfig[];
};
const applications = [["default", "Predeterminado"], ["continue", "Continuar ciclo"], ["work", "Trabaja"], ["free", "Libre"]];
const makeDays = (length: number, current: ShiftPatternDayConfig[] = []) =>
  Array.from({ length }, (_, dayOffset) => current.find((day) => day.dayOffset === dayOffset) ?? ({ dayOffset, statusCode: "TRABAJA", startTime: "08:00", endTime: "17:00" }));
const emptyForm = (): Form => ({ id: "", code: "", name: "", description: "", cycleLengthDays: 7, baseDate: "", holidayApplication: "default", weekendApplication: "default", isActive: true, days: makeDays(7) });
const inputClass = "h-10 rounded-2xl border border-[#9fb8d9] bg-white px-3 text-sm text-[#0f2747] outline-none focus:border-[#0b5cab] focus:ring-2 focus:ring-[#0b5cab]/15";

export default function PatronesPage() {
  const [patterns, setPatterns] = useState<ShiftPatternConfig[]>([]);
  const [statuses, setStatuses] = useState<OperationalStatusConfig[]>([]);
  const [form, setForm] = useState<Form>(emptyForm);
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const reload = useCallback(async () => {
    const [loaded, loadedStatuses] = await Promise.all([loadShiftPatterns(), loadOperationalStatuses()]);
    setPatterns(loaded); setStatuses(loadedStatuses); setError("");
  }, []);
  const { refresh, isRefreshing, lastUpdatedAt } = useAutoRefresh({ onRefresh: reload, pause: saving });
  useEffect(() => { reload().catch(() => setError("No se pudieron cargar los patrones.")); }, [reload]);
  const filtered = useMemo(() => {
    const value = search.trim().toLowerCase();
    return value ? patterns.filter((item) => `${item.code} ${item.name}`.toLowerCase().includes(value)) : patterns;
  }, [patterns, search]);

  function edit(item: ShiftPatternConfig) {
    setForm({ id: item.id, code: item.code, name: item.name, description: item.description, cycleLengthDays: item.cycleLengthDays, baseDate: item.baseDate ?? "", holidayApplication: item.holidayApplication, weekendApplication: item.weekendApplication, isActive: item.isActive, days: makeDays(item.cycleLengthDays, item.days) });
    setMessage(""); setError("");
  }
  function setLength(value: number) {
    const length = Math.max(1, Math.min(60, value || 1));
    setForm((current) => ({ ...current, cycleLengthDays: length, days: makeDays(length, current.days) }));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving(true); setMessage(""); setError("");
    try {
      const response = await fetch("/api/shift-patterns", { ...adminFetchInit, method: form.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, baseDate: form.baseDate || null }) });
      const data = await response.json() as { message?: string };
      if (!response.ok) throw new Error(data.message || "No se pudo guardar el patrón.");
      await reload(); setForm(emptyForm()); setMessage(form.id ? "Patrón actualizado." : "Patrón creado.");
    } catch (caught) { setError(caught instanceof Error ? caught.message : "No se pudo guardar el patrón."); }
    finally { setSaving(false); }
  }
  function updateDay(index: number, patch: Partial<ShiftPatternDayConfig>) {
    setForm((current) => ({ ...current, days: current.days.map((day, i) => i === index ? { ...day, ...patch } : day) }));
  }

  return <main className="mx-auto w-full max-w-[1450px] px-3 py-4 sm:px-6">
    <MaintainerPageHeader title="Patrones de turno" subtitle="Flota" onRefresh={() => void refresh()} isRefreshing={isRefreshing} lastUpdatedAt={lastUpdatedAt} />
    <div className="grid gap-4 xl:grid-cols-[minmax(300px,.7fr)_minmax(620px,1.3fr)]">
      <section className="overflow-hidden rounded-[22px] border border-[#b7cce4] bg-white shadow-lg shadow-slate-300/25">
        <div className="border-b border-[#c5d8eb] bg-[#eef3f9] p-4"><Field label="Buscar"><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Código o nombre" className={inputClass} /></Field></div>
        <div className="grid grid-cols-[1fr_.6fr_.5fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[#0f2747]"><span>Patrón</span><span>Ciclo</span><span>Estado</span></div>
        <div className="max-h-[72dvh] divide-y divide-[#c5d8eb] overflow-auto">{filtered.map((item) => <button key={item.id} type="button" onClick={() => edit(item)} className={uiListRowClass(form.id === item.id, "grid w-full grid-cols-[1fr_.6fr_.5fr] gap-2 px-3 py-2 text-left text-xs")}><span><strong className="block text-[#0f2747]">{item.name}</strong><span className="text-slate-500">{item.code}</span></span><span className="text-slate-600">{item.cycleLengthDays} días</span><span className={item.isActive ? "text-green-700" : "text-slate-500"}>{item.isActive ? "Activo" : "Inactivo"}</span></button>)}{!filtered.length && <p className="p-8 text-center text-sm text-slate-500">No hay patrones para mostrar.</p>}</div>
      </section>
      <form onSubmit={save} className="rounded-[22px] border border-[#b7cce4] bg-[#f8fbff] p-4 shadow-lg shadow-slate-300/20">
        <h2 className="font-heading text-lg font-semibold text-[#0f2747]">{form.id ? "Editar patrón" : "Nuevo patrón"}</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <Field label="Código"><input required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} className={`${inputClass} uppercase`} /></Field>
          <Field label="Nombre"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputClass} /></Field>
          <Field label="Descripción"><input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputClass} /></Field>
          <Field label="Fecha base"><input type="date" value={form.baseDate} onChange={(e) => setForm({ ...form, baseDate: e.target.value })} className={inputClass} /></Field>
          <Field label="Largo del ciclo (días)"><input type="number" min={1} max={60} value={form.cycleLengthDays} onChange={(e) => setLength(Number(e.target.value))} className={inputClass} /></Field>
          <label className="flex h-10 items-center justify-between self-end rounded-2xl border border-[#9fb8d9] bg-white px-3 text-xs font-semibold text-[#173b68]">Activo<input type="checkbox" checked={form.isActive} onChange={(e) => setForm({ ...form, isActive: e.target.checked })} className="h-4 w-4 accent-[#0b5cab]" /></label>
          <Field label="Aplicación en feriados"><select value={form.holidayApplication} onChange={(e) => setForm({ ...form, holidayApplication: e.target.value })} className={inputClass}>{applications.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
          <Field label="Aplicación fin de semana"><select value={form.weekendApplication} onChange={(e) => setForm({ ...form, weekendApplication: e.target.value })} className={inputClass}>{applications.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>
        </div>
        <div className="mt-4 overflow-auto rounded-2xl border border-[#b7cce4] bg-white">
          <div className="min-w-[560px] grid grid-cols-[.5fr_1fr_1fr_1fr] bg-[#d7e7f8] px-3 py-2 text-[10px] font-semibold uppercase text-[#0f2747]"><span>Día</span><span>Estado</span><span>Inicio</span><span>Término</span></div>
          <div className="max-h-[390px] overflow-auto">{form.days.map((day, index) => <div key={day.dayOffset} className="min-w-[560px] grid grid-cols-[.5fr_1fr_1fr_1fr] items-center gap-2 border-t border-[#d7e7f8] px-3 py-2 text-xs"><strong className="text-[#173b68]">{day.dayOffset + 1}</strong><select value={day.statusCode} onChange={(e) => updateDay(index, { statusCode: e.target.value })} className="h-8 rounded-xl border border-[#9fb8d9] px-2">{statuses.map((status) => <option key={status.id} value={status.code}>{status.code} · {status.name}</option>)}</select><input type="time" value={day.startTime} onChange={(e) => updateDay(index, { startTime: e.target.value })} className="h-8 rounded-xl border border-[#9fb8d9] px-2" /><input type="time" value={day.endTime} onChange={(e) => updateDay(index, { endTime: e.target.value })} className="h-8 rounded-xl border border-[#9fb8d9] px-2" /></div>)}</div>
        </div>
        {message && <p className="mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-800">{message}</p>}
        {error && <p className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
        <div className="mt-4 flex justify-end gap-2"><button type="button" onClick={() => { setForm(emptyForm()); setMessage(""); setError(""); }} className="h-10 rounded-2xl bg-[#0b5cab] px-4 text-sm font-semibold text-white">Cancelar</button><button disabled={saving} className="h-10 rounded-2xl bg-[#0b5cab] px-5 text-sm font-semibold text-white disabled:bg-slate-300">{saving ? "Guardando..." : form.id ? "Guardar cambios" : "Crear"}</button></div>
      </form>
    </div>
  </main>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold text-[#173b68]">{label}</span>{children}</label>;
}
