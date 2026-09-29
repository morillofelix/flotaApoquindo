export type LeasingEstado =
  | "BORRADOR"
  | "ACTIVO"
  | "PAGADO"
  | "SUSPENDIDO"
  | "ANULADO";

export type LeasingEstadoVisible = LeasingEstado | "VENCIDO";

export type LeasingCuotaEstado =
  | "PENDIENTE"
  | "PAGADA_PARCIAL"
  | "PAGADA"
  | "ANULADA";

export type LeasingCuotaEstadoVisible =
  | LeasingCuotaEstado
  | "VENCIDA"
  | "VENCIDA_PARCIAL";

export type LeasingPagoEstado = "ACTIVO" | "ANULADO";

export type LeasingMedioPago =
  | "TRANSFERENCIA"
  | "DEPOSITO"
  | "CHEQUE"
  | "EFECTIVO"
  | "OTRO";

export type LeasingNotificacionEstado =
  | "PENDIENTE"
  | "ENVIANDO"
  | "ENVIADO"
  | "FALLIDO";

export const LEASING_MAX_CUOTAS = 120;
export const LEASING_MAX_MONTO = 99_999_999_999;
export const LEASING_DEFAULT_MAX_FILE_SIZE_MB = 3;
export const LEASING_ABSOLUTE_MAX_FILE_SIZE_MB = 4;
export const LEASING_PAGE_SIZE = 20;

export const LEASING_ESTADO_LABELS: Record<LeasingEstadoVisible, string> = {
  BORRADOR: "Borrador",
  ACTIVO: "Activo",
  PAGADO: "Pagado",
  SUSPENDIDO: "Suspendido",
  ANULADO: "Anulado",
  VENCIDO: "Vencido",
};

export const LEASING_CUOTA_ESTADO_LABELS: Record<LeasingCuotaEstadoVisible, string> = {
  PENDIENTE: "Pendiente",
  PAGADA_PARCIAL: "Pagada parcial",
  PAGADA: "Pagada",
  ANULADA: "Anulada",
  VENCIDA: "Vencida",
  VENCIDA_PARCIAL: "Vencida – abono parcial",
};

export const LEASING_MEDIO_PAGO_LABELS: Record<LeasingMedioPago, string> = {
  TRANSFERENCIA: "Transferencia",
  DEPOSITO: "Depósito",
  CHEQUE: "Cheque",
  EFECTIVO: "Efectivo",
  OTRO: "Otro",
};

export const LEASING_MEDIOS_PAGO = Object.keys(
  LEASING_MEDIO_PAGO_LABELS,
) as LeasingMedioPago[];

export const LEASING_NOTIFICACION_LABELS: Record<LeasingNotificacionEstado, string> = {
  PENDIENTE: "Pendiente",
  ENVIANDO: "Enviando",
  ENVIADO: "Enviado",
  FALLIDO: "Fallido",
};

export type LeasingPropietarioResultado = {
  id: string;
  movil: string;
  razonSocial: string;
  rut: string;
  nombre: string;
  email: string;
  status: string;
  elegible: boolean;
  motivoNoElegible: string;
  leasingsVigentes: number;
};

export type LeasingCuotaPreview = {
  numeroCuota: number;
  fechaVencimiento: string;
  montoOriginal: number;
};

export type LeasingComprobanteDto = {
  nombreOriginal: string;
  mimeType: string;
  tamano: number;
  origen: string;
};

export type LeasingCorreoDto = {
  id: string;
  tipo: string;
  estado: LeasingNotificacionEstado;
  destinatario: string;
  cantidadIntentos: number;
  ultimoError: string;
  enviadoAt: string | null;
  createdAt: string;
};

export type LeasingPagoDto = {
  id: string;
  cuotaId: string;
  fechaPago: string;
  monto: number;
  medioPago: LeasingMedioPago;
  numeroOperacion: string;
  banco: string;
  observaciones: string;
  estado: LeasingPagoEstado;
  createdByEmail: string;
  createdAt: string;
  anuladoByEmail: string;
  anuladoAt: string | null;
  motivoAnulacion: string;
  comprobante: LeasingComprobanteDto | null;
  correos: LeasingCorreoDto[];
};

export type LeasingCuotaDto = {
  id: string;
  numeroCuota: number;
  fechaVencimiento: string;
  montoOriginal: number;
  montoPagado: number;
  saldo: number;
  estado: LeasingCuotaEstado;
  estadoVisible: LeasingCuotaEstadoVisible;
  fechaUltimoPago: string | null;
  pagos: LeasingPagoDto[];
};

export type LeasingResumenDto = {
  id: string;
  numero: number;
  codigo: string;
  propietarioId: string | null;
  vinculado: boolean;
  movil: string;
  razonSocial: string;
  rut: string;
  montoTotal: number;
  totalPagado: number;
  saldo: number;
  cantidadCuotas: number;
  cuotasPagadas: number;
  cuotasPendientes: number;
  cuotasVencidas: number;
  proximoVencimiento: string | null;
  estado: LeasingEstado;
  estadoVisible: LeasingEstadoVisible;
  fechaInicio: string;
  diaCorte: number;
  createdAt: string;
};

export type LeasingDetalleDto = LeasingResumenDto & {
  observaciones: string;
  motivoEstado: string;
  createdByEmail: string;
  propietarioNombre: string;
  propietarioEmail: string;
  cuotas: LeasingCuotaDto[];
};

export type LeasingIndicadoresDto = {
  totalFinanciado: number;
  totalCobrado: number;
  saldoPendiente: number;
  cuotasPendientes: number;
  cuotasVencidas: number;
  montoVencido: number;
  proximosVencimientos: number;
  espacioComprobantesBytes: number;
};

export type LeasingListadoDto = {
  leasings: LeasingResumenDto[];
  total: number;
  page: number;
  pageSize: number;
  indicadores: LeasingIndicadoresDto;
};

export function formatLeasingCodigo(numero: number) {
  return `LSG-${String(numero).padStart(6, "0")}`;
}

export function parseLeasingCodigo(value: string) {
  const digits = value.replace(/\D/g, "");
  const numero = Number(digits);
  return digits && Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

export function formatLeasingMonto(value: number) {
  return new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency: "CLP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatLeasingFecha(value: string | null | undefined) {
  if (!value) {
    return "—";
  }

  const [year, month, day] = value.slice(0, 10).split("-");
  return year && month && day ? `${day}-${month}-${year}` : value;
}

export function formatLeasingBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function parseLeasingMontoInput(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? Number(digits) : 0;
}

export function normalizeLeasingMovil(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits ? digits.padStart(3, "0") : "";
}

export function normalizeLeasingRut(value: string) {
  return value.replace(/[^0-9kK]/g, "").toUpperCase();
}

export function formatLeasingRut(value: string) {
  const clean = normalizeLeasingRut(value);

  if (clean.length < 2) {
    return clean;
  }

  const body = clean.slice(0, -1);
  const verifier = clean.slice(-1);
  return `${body.replace(/\B(?=(\d{3})+(?!\d))/g, ".")}-${verifier}`;
}

export function isValidLeasingDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year = 0, month = 0, day = 0] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function toDateOnly(year: number, monthIndex: number, day: number) {
  const date = new Date(Date.UTC(year, monthIndex, day));
  return date.toISOString().slice(0, 10);
}

export type LeasingCalculoInput = {
  montoTotal: number;
  cantidadCuotas: number;
  fechaInicio: string;
  diaCorte: number;
};

export function validateLeasingCalculoInput(input: LeasingCalculoInput) {
  if (
    !Number.isSafeInteger(input.montoTotal) ||
    input.montoTotal <= 0 ||
    input.montoTotal > LEASING_MAX_MONTO
  ) {
    return "Ingresa un monto total en pesos, mayor que cero.";
  }

  if (
    !Number.isInteger(input.cantidadCuotas) ||
    input.cantidadCuotas < 1 ||
    input.cantidadCuotas > LEASING_MAX_CUOTAS
  ) {
    return `La cantidad de cuotas debe estar entre 1 y ${LEASING_MAX_CUOTAS}.`;
  }

  if (input.montoTotal < input.cantidadCuotas) {
    return "El monto total no alcanza para esa cantidad de cuotas.";
  }

  if (!isValidLeasingDate(input.fechaInicio)) {
    return "Ingresa una fecha de inicio válida.";
  }

  if (
    !Number.isInteger(input.diaCorte) ||
    input.diaCorte < 1 ||
    input.diaCorte > 31
  ) {
    return "El día de corte debe estar entre 1 y 31.";
  }

  return null;
}

/**
 * Cuotas mensuales en pesos enteros. La cuota 1 vence el día de corte del mes
 * siguiente a la fecha de inicio; en meses sin ese día se usa el último día.
 * La diferencia de redondeo se suma solo a la última cuota.
 */
export function generarCuotasLeasing(
  input: LeasingCalculoInput,
): LeasingCuotaPreview[] {
  const [startYear = 0, startMonth = 1] = input.fechaInicio.split("-").map(Number);
  const base = Math.floor(input.montoTotal / input.cantidadCuotas);
  const ultima = input.montoTotal - base * (input.cantidadCuotas - 1);

  return Array.from({ length: input.cantidadCuotas }, (_, index) => {
    const monthOffset = startMonth - 1 + index + 1;
    const year = startYear + Math.floor(monthOffset / 12);
    const monthIndex = monthOffset % 12;
    const day = Math.min(input.diaCorte, daysInMonth(year, monthIndex));

    return {
      numeroCuota: index + 1,
      fechaVencimiento: toDateOnly(year, monthIndex, day),
      montoOriginal: index === input.cantidadCuotas - 1 ? ultima : base,
    };
  });
}

export function calcularEstadoCuota(
  montoOriginal: number,
  montoPagado: number,
): LeasingCuotaEstado {
  if (montoPagado <= 0) {
    return "PENDIENTE";
  }

  return montoPagado >= montoOriginal ? "PAGADA" : "PAGADA_PARCIAL";
}

export function isCuotaVencida(
  cuota: { estado: LeasingCuotaEstado; fechaVencimiento: string },
  today: string,
) {
  return (
    (cuota.estado === "PENDIENTE" || cuota.estado === "PAGADA_PARCIAL") &&
    cuota.fechaVencimiento < today
  );
}

export function getCuotaEstadoVisible(
  cuota: { estado: LeasingCuotaEstado; fechaVencimiento: string },
  today: string,
): LeasingCuotaEstadoVisible {
  if (!isCuotaVencida(cuota, today)) {
    return cuota.estado;
  }

  return cuota.estado === "PAGADA_PARCIAL" ? "VENCIDA_PARCIAL" : "VENCIDA";
}

export function calcularEstadoLeasing(
  estadoActual: LeasingEstado,
  cuotas: Array<{ estado: LeasingCuotaEstado }>,
): LeasingEstado {
  if (estadoActual !== "ACTIVO" && estadoActual !== "PAGADO") {
    return estadoActual;
  }

  const vigentes = cuotas.filter((cuota) => cuota.estado !== "ANULADA");
  const todasPagadas =
    vigentes.length > 0 && vigentes.every((cuota) => cuota.estado === "PAGADA");

  return todasPagadas ? "PAGADO" : "ACTIVO";
}

export function getLeasingEstadoVisible(
  estado: LeasingEstado,
  cuotasVencidas: number,
): LeasingEstadoVisible {
  return estado === "ACTIVO" && cuotasVencidas > 0 ? "VENCIDO" : estado;
}

export function getLeasingEstadoBadgeClass(estado: LeasingEstadoVisible) {
  switch (estado) {
    case "PAGADO":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "VENCIDO":
      return "border-red-200 bg-red-50 text-red-700";
    case "SUSPENDIDO":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "ANULADO":
      return "border-slate-200 bg-slate-100 text-slate-500";
    case "BORRADOR":
      return "border-[#c5d8eb] bg-[#f8fbff] text-slate-600";
    default:
      return "border-[#b7cce4] bg-[#eef3f9] text-[#0b5cab]";
  }
}

export function getCuotaEstadoBadgeClass(estado: LeasingCuotaEstadoVisible) {
  switch (estado) {
    case "PAGADA":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "PAGADA_PARCIAL":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "VENCIDA":
    case "VENCIDA_PARCIAL":
      return "border-red-200 bg-red-50 text-red-700";
    case "ANULADA":
      return "border-slate-200 bg-slate-100 text-slate-500";
    default:
      return "border-[#b7cce4] bg-[#eef3f9] text-[#0b5cab]";
  }
}
