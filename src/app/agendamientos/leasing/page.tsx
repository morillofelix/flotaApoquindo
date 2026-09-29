"use client";

import MaintainerPageHeader from "@/components/agendamientos/MaintainerPageHeader";
import LeasingDetalleModal from "@/components/agendamientos/leasing/LeasingDetalleModal";
import LeasingNuevoModal from "@/components/agendamientos/leasing/LeasingNuevoModal";
import {
  leasingBadgeClass,
  leasingFetch,
  leasingInputClass,
  leasingLabelClass,
  leasingPrimaryButton,
  leasingSecondaryButton,
} from "@/components/agendamientos/leasing/leasing-ui";
import { useAutoRefresh } from "@/hooks/use-auto-refresh";
import type { AccessPermissions } from "@/lib/access-users";
import {
  formatLeasingBytes,
  formatLeasingFecha,
  formatLeasingMonto,
  getLeasingEstadoBadgeClass,
  LEASING_ESTADO_LABELS,
  type LeasingListadoDto,
} from "@/lib/leasing";
import { UI_CARD_SHELL, uiListRowClass } from "@/lib/ui-borders";
import { useCallback, useEffect, useMemo, useState } from "react";

type Filtros = {
  codigo: string;
  movil: string;
  razonSocial: string;
  rut: string;
  estado: string;
  estadoCuota: string;
  desde: string;
  hasta: string;
};

const filtrosVacios: Filtros = {
  codigo: "",
  movil: "",
  razonSocial: "",
  rut: "",
  estado: "",
  estadoCuota: "",
  desde: "",
  hasta: "",
};

type SessionInfo = {
  isSuperAdmin: boolean;
  permissions: Partial<AccessPermissions>;
};

function Indicador({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "ok" | "warn" | "danger" }) {
  const toneClass =
    tone === "ok"
      ? "text-emerald-700"
      : tone === "warn"
        ? "text-amber-700"
        : tone === "danger"
          ? "text-red-700"
          : "text-[#0f2747]";

  return (
    <div className="rounded-2xl border border-[#b7cce4] bg-white px-3 py-2">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-0.5 text-base font-semibold ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function LeasingPage() {
  const [filtrosForm, setFiltrosForm] = useState<Filtros>(filtrosVacios);
  const [filtros, setFiltros] = useState<Filtros>(filtrosVacios);
  const [page, setPage] = useState(1);
  const [listado, setListado] = useState<LeasingListadoDto | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [isNuevoOpen, setIsNuevoOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const canCobrar = Boolean(session?.isSuperAdmin || session?.permissions.leasingCobros);
  const canAdministrar = Boolean(session?.isSuperAdmin || session?.permissions.leasingAdmin);

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    Object.entries(filtros).forEach(([key, value]) => {
      if (value.trim()) {
        params.set(key, value.trim());
      }
    });
    params.set("page", String(page));
    return params.toString();
  }, [filtros, page]);

  const cargar = useCallback(async () => {
    const data = await leasingFetch<LeasingListadoDto>(`/api/leasing?${queryString}`);
    setListado(data);
    setError("");
  }, [queryString]);

  const { refresh, isRefreshing, lastUpdatedAt } = useAutoRefresh({
    onRefresh: cargar,
    pause: isNuevoOpen || Boolean(detalleId),
  });

  useEffect(() => {
    cargar().catch((loadError: unknown) =>
      setError(loadError instanceof Error ? loadError.message : "No se pudo cargar el listado."),
    );
  }, [cargar]);

  useEffect(() => {
    leasingFetch<SessionInfo>("/api/accesos/session")
      .then(setSession)
      .catch(() => setSession({ isSuperAdmin: false, permissions: {} }));
  }, []);

  function aplicarFiltros(event: React.FormEvent) {
    event.preventDefault();
    setPage(1);
    setFiltros(filtrosForm);
  }

  function limpiarFiltros() {
    setFiltrosForm(filtrosVacios);
    setFiltros(filtrosVacios);
    setPage(1);
  }

  const indicadores = listado?.indicadores;
  const totalPages = listado ? Math.max(1, Math.ceil(listado.total / listado.pageSize)) : 1;

  return (
    <main className="px-3 py-4 sm:px-6 sm:py-6 xl:px-10">
      <section className="mx-auto w-full max-w-[1540px]">
        <MaintainerPageHeader
          title="Leasing"
          subtitle="Administración"
          onRefresh={() => void refresh()}
          isRefreshing={isRefreshing}
          lastUpdatedAt={lastUpdatedAt}
          actions={
            canCobrar ? (
              <button type="button" onClick={() => setIsNuevoOpen(true)} className={leasingPrimaryButton}>
                Nuevo leasing
              </button>
            ) : null
          }
        />

        {message ? (
          <p className="mb-3 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{message}</p>
        ) : null}
        {error ? (
          <p className="mb-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</p>
        ) : null}

        {indicadores ? (
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
            <Indicador label="Total financiado" value={formatLeasingMonto(indicadores.totalFinanciado)} />
            <Indicador label="Total cobrado" value={formatLeasingMonto(indicadores.totalCobrado)} tone="ok" />
            <Indicador label="Saldo pendiente" value={formatLeasingMonto(indicadores.saldoPendiente)} />
            <Indicador label="Cuotas pendientes" value={String(indicadores.cuotasPendientes)} />
            <Indicador label="Cuotas vencidas" value={String(indicadores.cuotasVencidas)} tone={indicadores.cuotasVencidas ? "danger" : "default"} />
            <Indicador label="Monto vencido" value={formatLeasingMonto(indicadores.montoVencido)} tone={indicadores.montoVencido ? "danger" : "default"} />
            <Indicador label="Vencen en 30 días" value={String(indicadores.proximosVencimientos)} tone={indicadores.proximosVencimientos ? "warn" : "default"} />
            <Indicador label="Espacio comprobantes" value={formatLeasingBytes(indicadores.espacioComprobantesBytes)} />
          </div>
        ) : null}

        <div className={`overflow-hidden ${UI_CARD_SHELL}`}>
          <form onSubmit={aplicarFiltros} className="grid gap-2 border-b border-[#c5d8eb] p-4 sm:grid-cols-4 xl:grid-cols-[110px_90px_1.4fr_130px_140px_150px_140px_140px_auto]">
            <label className="flex flex-col gap-1">
              <span className={leasingLabelClass}>Código</span>
              <input value={filtrosForm.codigo} onChange={(event) => setFiltrosForm((current) => ({ ...current, codigo: event.target.value }))} placeholder="LSG-..." className={leasingInputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={leasingLabelClass}>Móvil</span>
              <input value={filtrosForm.movil} onChange={(event) => setFiltrosForm((current) => ({ ...current, movil: event.target.value }))} className={leasingInputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={leasingLabelClass}>Razón social</span>
              <input value={filtrosForm.razonSocial} onChange={(event) => setFiltrosForm((current) => ({ ...current, razonSocial: event.target.value }))} className={leasingInputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={leasingLabelClass}>RUT</span>
              <input value={filtrosForm.rut} onChange={(event) => setFiltrosForm((current) => ({ ...current, rut: event.target.value }))} className={leasingInputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={leasingLabelClass}>Estado leasing</span>
              <select value={filtrosForm.estado} onChange={(event) => setFiltrosForm((current) => ({ ...current, estado: event.target.value }))} className={leasingInputClass}>
                <option value="">Todos</option>
                <option value="BORRADOR">Borrador</option>
                <option value="ACTIVO">Activo</option>
                <option value="VENCIDO">Vencido</option>
                <option value="PAGADO">Pagado</option>
                <option value="SUSPENDIDO">Suspendido</option>
                <option value="ANULADO">Anulado</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={leasingLabelClass}>Estado cuotas</span>
              <select value={filtrosForm.estadoCuota} onChange={(event) => setFiltrosForm((current) => ({ ...current, estadoCuota: event.target.value }))} className={leasingInputClass}>
                <option value="">Todas</option>
                <option value="PENDIENTE">Con pendientes</option>
                <option value="PAGADA_PARCIAL">Con abono parcial</option>
                <option value="VENCIDA">Con vencidas</option>
                <option value="PAGADA">Con pagadas</option>
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className={leasingLabelClass}>Inicio desde</span>
              <input type="date" value={filtrosForm.desde} onChange={(event) => setFiltrosForm((current) => ({ ...current, desde: event.target.value }))} className={leasingInputClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className={leasingLabelClass}>Inicio hasta</span>
              <input type="date" value={filtrosForm.hasta} onChange={(event) => setFiltrosForm((current) => ({ ...current, hasta: event.target.value }))} className={leasingInputClass} />
            </label>
            <div className="flex items-end gap-2">
              <button type="submit" className={leasingPrimaryButton}>Filtrar</button>
              <button type="button" onClick={limpiarFiltros} className={leasingSecondaryButton}>Limpiar</button>
            </div>
          </form>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1100px] text-xs">
              <thead className="bg-[#d7e7f8] text-[10px] uppercase tracking-[0.12em] text-[#0f2747]">
                <tr>
                  <th className="px-3 py-2 text-left">Código</th>
                  <th className="px-3 py-2 text-left">Móvil</th>
                  <th className="px-3 py-2 text-left">Razón social</th>
                  <th className="px-3 py-2 text-left">RUT</th>
                  <th className="px-3 py-2 text-right">Monto total</th>
                  <th className="px-3 py-2 text-right">Pagado</th>
                  <th className="px-3 py-2 text-right">Saldo</th>
                  <th className="px-3 py-2 text-center">Cuotas</th>
                  <th className="px-3 py-2 text-left">Próx. venc.</th>
                  <th className="px-3 py-2 text-left">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#c5d8eb]">
                {!listado ? (
                  <tr><td colSpan={10} className="px-3 py-6 text-center text-sm text-slate-500">Cargando...</td></tr>
                ) : listado.leasings.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-3 py-6 text-center text-sm text-slate-500">
                      No hay leasing registrados con estos filtros.
                    </td>
                  </tr>
                ) : (
                  listado.leasings.map((leasing) => (
                    <tr
                      key={leasing.id}
                      onClick={() => setDetalleId(leasing.id)}
                      className={uiListRowClass(false, "cursor-pointer text-[#0f2747]")}
                    >
                      <td className="px-3 py-2 font-semibold text-[#0b5cab]">{leasing.codigo}</td>
                      <td className="px-3 py-2 font-semibold">{leasing.movil}</td>
                      <td className="px-3 py-2">
                        {leasing.razonSocial}
                        {!leasing.vinculado ? <span className="ml-1 text-[10px] text-amber-700">(desvinculado)</span> : null}
                      </td>
                      <td className="px-3 py-2">{leasing.rut}</td>
                      <td className="px-3 py-2 text-right">{formatLeasingMonto(leasing.montoTotal)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">{formatLeasingMonto(leasing.totalPagado)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{formatLeasingMonto(leasing.saldo)}</td>
                      <td className="px-3 py-2 text-center">
                        {leasing.cuotasPagadas}/{leasing.cantidadCuotas}
                        {leasing.cuotasVencidas ? <span className="ml-1 font-semibold text-red-700">({leasing.cuotasVencidas} venc.)</span> : null}
                      </td>
                      <td className="px-3 py-2">{formatLeasingFecha(leasing.proximoVencimiento)}</td>
                      <td className="px-3 py-2">
                        <span className={`${leasingBadgeClass} ${getLeasingEstadoBadgeClass(leasing.estadoVisible)}`}>
                          {LEASING_ESTADO_LABELS[leasing.estadoVisible]}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {listado && listado.total > listado.pageSize ? (
            <div className="flex items-center justify-between border-t border-[#c5d8eb] px-4 py-3 text-xs text-slate-600">
              <span>{listado.total} leasing · página {page} de {totalPages}</span>
              <div className="flex gap-2">
                <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)} className={leasingSecondaryButton}>
                  Anterior
                </button>
                <button type="button" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)} className={leasingSecondaryButton}>
                  Siguiente
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </section>

      {isNuevoOpen ? (
        <LeasingNuevoModal
          onClose={() => setIsNuevoOpen(false)}
          onCreated={(id, codigo) => {
            setIsNuevoOpen(false);
            setMessage(`Leasing ${codigo} creado.`);
            setDetalleId(id);
            void cargar();
          }}
        />
      ) : null}

      {detalleId ? (
        <LeasingDetalleModal
          leasingId={detalleId}
          canCobrar={canCobrar}
          canAdministrar={canAdministrar}
          onClose={() => setDetalleId(null)}
          onChanged={() => void cargar().catch(() => undefined)}
        />
      ) : null}
    </main>
  );
}
