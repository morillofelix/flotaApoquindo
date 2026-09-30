import { Prisma } from "@prisma/client";
import { readAdminSession } from "@/lib/driver-auth";
import {
  calcularEstadoCuota,
  calcularEstadoLeasing,
  formatLeasingCodigo,
  formatLeasingRut,
  generarCuotasLeasing,
  getCuotaEstadoVisible,
  getLeasingEstadoVisible,
  isCuotaVencida,
  isLeasingBancoValido,
  isValidLeasingDate,
  LEASING_MEDIOS_CON_BANCO,
  LEASING_MEDIOS_PAGO,
  LEASING_PAGE_SIZE,
  normalizeLeasingMovil,
  normalizeLeasingRut,
  parseLeasingCodigo,
  validateLeasingCalculoInput,
  type LeasingCuotaEstado,
  type LeasingDetalleDto,
  type LeasingEstado,
  type LeasingIndicadoresDto,
  type LeasingListadoDto,
  type LeasingMedioPago,
  type LeasingPropietarioResultado,
  type LeasingResumenDto,
} from "@/lib/leasing";
import type { ValidatedLeasingComprobante } from "@/lib/leasing-comprobante-server";
import { getLeasingStorageProvider } from "@/lib/leasing-storage-server";
import { getSantiagoDateString } from "@/lib/propietario-status";
import { prisma } from "@/lib/prisma";
import type { NextRequest } from "next/server";

type Tx = Prisma.TransactionClient;

export type LeasingActor = {
  email: string;
  accessUserId: string | null;
};

export class LeasingOperationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VIGENTE_ESTADOS: LeasingEstado[] = ["BORRADOR", "ACTIVO", "SUSPENDIDO"];
const INDICADOR_ESTADOS: LeasingEstado[] = ["ACTIVO", "PAGADO", "SUSPENDIDO"];
const CUOTA_CON_SALDO: LeasingCuotaEstado[] = ["PENDIENTE", "PAGADA_PARCIAL"];

export function getLeasingActor(request: NextRequest): LeasingActor {
  const session = readAdminSession(request);
  return {
    email: (session?.email ?? session?.user ?? "").trim().toLowerCase(),
    accessUserId: session?.accessUserId ?? null,
  };
}

export function getLeasingToday() {
  return getSantiagoDateString();
}

export function toPesos(value: Prisma.Decimal | number | null | undefined) {
  if (value === null || value === undefined) {
    return 0;
  }

  return typeof value === "number" ? value : Number(value.toString());
}

function toDateOnly(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : null;
}

function dateFromOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function addDays(dateValue: string, days: number) {
  const date = dateFromOnly(dateValue);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function sanitizeLeasingText(value: unknown, maxLength: number) {
  if (typeof value !== "string") {
    return "";
  }

  return value
    .replace(/<[^>]*>/g, "")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .trim()
    .slice(0, maxLength);
}

export function toLeasingErrorResponseMessage(error: unknown, fallback: string) {
  if (error instanceof LeasingOperationError) {
    return { message: error.message, status: error.status };
  }

  console.error("[leasing]", error);
  return { message: fallback, status: 500 };
}

async function writeLeasingAudit(
  client: Tx,
  input: {
    actor: LeasingActor;
    accion: string;
    leasingId?: string | null;
    cuotaId?: string | null;
    pagoId?: string | null;
    valoresAnteriores?: Prisma.InputJsonValue;
    valoresNuevos?: Prisma.InputJsonValue;
    descripcion?: string;
  },
) {
  await client.leasingAuditoria.create({
    data: {
      leasingId: input.leasingId ?? null,
      cuotaId: input.cuotaId ?? null,
      pagoId: input.pagoId ?? null,
      accion: input.accion,
      valoresAnteriores: input.valoresAnteriores,
      valoresNuevos: input.valoresNuevos,
      descripcion: input.descripcion ?? "",
      usuarioEmail: input.actor.email,
      usuarioAccessUserId: input.actor.accessUserId,
    },
  });
}

export async function writeLeasingAuditStandalone(
  input: Parameters<typeof writeLeasingAudit>[1],
) {
  await prisma.$transaction((tx) => writeLeasingAudit(tx, input));
}

// ---------------------------------------------------------------------------
// Búsqueda de propietarios (solo lectura)
// ---------------------------------------------------------------------------

const propietarioSelect = {
  id: true,
  vehicleNumber: true,
  fullName: true,
  rut: true,
  firstName: true,
  lastName: true,
  secondLastName: true,
  email: true,
  status: true,
  isActive: true,
  importKey: true,
} satisfies Prisma.PropietarioSelect;

type PropietarioLectura = Prisma.PropietarioGetPayload<{
  select: typeof propietarioSelect;
}>;

function getPropietarioNombre(propietario: {
  firstName: string;
  lastName: string;
  secondLastName: string;
}) {
  return [propietario.firstName, propietario.lastName, propietario.secondLastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");
}

function getMotivoNoElegible(propietario: PropietarioLectura) {
  if (!propietario.isActive || propietario.status !== "activo") {
    return "El propietario no está activo.";
  }

  if (!/^\d{1,4}$/.test(propietario.vehicleNumber.trim())) {
    return "El registro no tiene número de móvil.";
  }

  if (!normalizeLeasingRut(propietario.rut)) {
    return "El registro no tiene RUT.";
  }

  return "";
}

export async function buscarPropietariosLeasing(
  query: string,
): Promise<LeasingPropietarioResultado[]> {
  const text = query.trim().slice(0, 80);

  if (text.length < 1) {
    return [];
  }

  const hasLetters = /[a-jl-zA-JL-ZñÑáéíóúÁÉÍÓÚ]/.test(text);
  const digits = text.replace(/\D/g, "");
  let propietarios: PropietarioLectura[] = [];

  if (!hasLetters && digits.length > 0 && digits.length <= 4 && !/[.\-kK]/.test(text)) {
    propietarios = await prisma.propietario.findMany({
      where: { vehicleNumber: normalizeLeasingMovil(digits) },
      select: propietarioSelect,
      orderBy: [{ fullName: "asc" }],
      take: 20,
    });
  } else if (!hasLetters && normalizeLeasingRut(text).length >= 5) {
    const rutLike = `%${normalizeLeasingRut(text)}%`;
    const ids = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT "id" FROM "Propietario"
      WHERE upper(regexp_replace("rut", '[^0-9kK]', '', 'g')) LIKE ${rutLike}
      ORDER BY "fullName" ASC
      LIMIT 20`;

    propietarios = ids.length
      ? await prisma.propietario.findMany({
          where: { id: { in: ids.map((row) => row.id) } },
          select: propietarioSelect,
          orderBy: [{ fullName: "asc" }],
        })
      : [];
  } else if (text.length >= 2) {
    propietarios = await prisma.propietario.findMany({
      where: { fullName: { contains: text, mode: "insensitive" } },
      select: propietarioSelect,
      orderBy: [{ fullName: "asc" }],
      take: 20,
    });
  }

  if (!propietarios.length) {
    return [];
  }

  const vigentes = await prisma.leasing.groupBy({
    by: ["propietarioId"],
    where: {
      propietarioId: { in: propietarios.map((item) => item.id) },
      estado: { in: VIGENTE_ESTADOS },
    },
    _count: { _all: true },
  });
  const vigentesById = new Map(
    vigentes.map((row) => [row.propietarioId ?? "", row._count._all]),
  );

  return propietarios.map((propietario) => {
    const motivo = getMotivoNoElegible(propietario);

    return {
      id: propietario.id,
      movil: propietario.vehicleNumber,
      razonSocial: propietario.fullName,
      rut: propietario.rut,
      nombre: getPropietarioNombre(propietario),
      email: propietario.email,
      status: propietario.status,
      elegible: !motivo,
      motivoNoElegible: motivo,
      leasingsVigentes: vigentesById.get(propietario.id) ?? 0,
    };
  });
}

// ---------------------------------------------------------------------------
// Revinculación (solo escribe en Leasing)
// ---------------------------------------------------------------------------

export async function revincularLeasingsHuerfanos() {
  const huerfanos = await prisma.leasing.findMany({
    where: { propietarioId: null, estado: { not: "ANULADO" } },
    select: { id: true, propietarioImportKey: true },
    take: 200,
  });

  for (const leasing of huerfanos) {
    if (!leasing.propietarioImportKey) {
      continue;
    }

    const propietario = await prisma.propietario.findUnique({
      where: { importKey: leasing.propietarioImportKey },
      select: { id: true },
    });

    if (!propietario) {
      continue;
    }

    await prisma.$transaction(async (tx) => {
      const updated = await tx.leasing.updateMany({
        where: { id: leasing.id, propietarioId: null },
        data: { propietarioId: propietario.id },
      });

      if (updated.count > 0) {
        await writeLeasingAudit(tx, {
          actor: { email: "sistema", accessUserId: null },
          accion: "LEASING_REVINCULADO_AUTOMATICO",
          leasingId: leasing.id,
          valoresNuevos: { propietarioId: propietario.id },
          descripcion: "Revinculado por clave estable del propietario.",
        });
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Listado e indicadores
// ---------------------------------------------------------------------------

export type LeasingFiltros = {
  codigo: string;
  movil: string;
  razonSocial: string;
  rut: string;
  estado: string;
  estadoCuota: string;
  desde: string;
  hasta: string;
  page: number;
};

export function parseLeasingFiltros(searchParams: URLSearchParams): LeasingFiltros {
  const read = (key: string, max = 80) =>
    (searchParams.get(key) ?? "").trim().slice(0, max);
  const page = Number(searchParams.get("page") ?? "1");

  return {
    codigo: read("codigo"),
    movil: read("movil"),
    razonSocial: read("razonSocial"),
    rut: read("rut"),
    estado: read("estado"),
    estadoCuota: read("estadoCuota"),
    desde: read("desde", 10),
    hasta: read("hasta", 10),
    page: Number.isInteger(page) && page > 0 ? page : 1,
  };
}

function buildLeasingWhere(
  filtros: LeasingFiltros,
  today: string,
): Prisma.LeasingWhereInput {
  const and: Prisma.LeasingWhereInput[] = [];
  const cuotaVencida: Prisma.LeasingCuotaWhereInput = {
    estado: { in: CUOTA_CON_SALDO },
    fechaVencimiento: { lt: dateFromOnly(today) },
  };

  if (filtros.codigo) {
    const numero = parseLeasingCodigo(filtros.codigo);
    and.push({ numero: numero ?? -1 });
  }

  if (filtros.movil) {
    const movil = normalizeLeasingMovil(filtros.movil);
    and.push({
      OR: [
        { movilSnapshot: movil },
        { propietario: { is: { vehicleNumber: movil } } },
      ],
    });
  }

  if (filtros.razonSocial) {
    and.push({
      OR: [
        { razonSocialSnapshot: { contains: filtros.razonSocial, mode: "insensitive" } },
        {
          propietario: {
            is: { fullName: { contains: filtros.razonSocial, mode: "insensitive" } },
          },
        },
      ],
    });
  }

  if (filtros.rut) {
    const variants = Array.from(
      new Set([filtros.rut, formatLeasingRut(filtros.rut)].filter(Boolean)),
    );
    and.push({
      OR: variants.flatMap((variant) => [
        { rutSnapshot: { contains: variant, mode: "insensitive" as const } },
        { propietario: { is: { rut: { contains: variant, mode: "insensitive" as const } } } },
      ]),
    });
  }

  if (filtros.estado === "VENCIDO") {
    and.push({ estado: "ACTIVO", cuotas: { some: cuotaVencida } });
  } else if (
    ["BORRADOR", "ACTIVO", "PAGADO", "SUSPENDIDO", "ANULADO"].includes(filtros.estado)
  ) {
    and.push({ estado: filtros.estado as LeasingEstado });
  }

  if (filtros.estadoCuota === "VENCIDA") {
    and.push({ cuotas: { some: cuotaVencida } });
  } else if (filtros.estadoCuota === "PENDIENTE") {
    and.push({ cuotas: { some: { estado: { in: CUOTA_CON_SALDO } } } });
  } else if (filtros.estadoCuota === "PAGADA_PARCIAL") {
    and.push({ cuotas: { some: { estado: "PAGADA_PARCIAL" } } });
  } else if (filtros.estadoCuota === "PAGADA") {
    and.push({ cuotas: { some: { estado: "PAGADA" } } });
  }

  if (isValidLeasingDate(filtros.desde)) {
    and.push({ fechaInicio: { gte: dateFromOnly(filtros.desde) } });
  }

  if (isValidLeasingDate(filtros.hasta)) {
    and.push({ fechaInicio: { lte: dateFromOnly(filtros.hasta) } });
  }

  return and.length ? { AND: and } : {};
}

const resumenInclude = {
  propietario: { select: { vehicleNumber: true, fullName: true, rut: true } },
  cuotas: {
    select: {
      estado: true,
      fechaVencimiento: true,
      montoOriginal: true,
      montoPagado: true,
    },
    orderBy: { numeroCuota: "asc" },
  },
} satisfies Prisma.LeasingInclude;

type LeasingConResumen = Prisma.LeasingGetPayload<{ include: typeof resumenInclude }>;

function toLeasingResumen(leasing: LeasingConResumen, today: string): LeasingResumenDto {
  const cuotas = leasing.cuotas.map((cuota) => ({
    estado: cuota.estado as LeasingCuotaEstado,
    fechaVencimiento: toDateOnly(cuota.fechaVencimiento) ?? "",
    montoOriginal: toPesos(cuota.montoOriginal),
    montoPagado: toPesos(cuota.montoPagado),
  }));
  const vigentes = cuotas.filter((cuota) => cuota.estado !== "ANULADA");
  const totalPagado = vigentes.reduce((sum, cuota) => sum + cuota.montoPagado, 0);
  const cuotasVencidas = vigentes.filter((cuota) => isCuotaVencida(cuota, today)).length;
  const proxima = vigentes.find(
    (cuota) => cuota.estado === "PENDIENTE" || cuota.estado === "PAGADA_PARCIAL",
  );
  const montoTotal = toPesos(leasing.montoTotal);
  const estado = leasing.estado as LeasingEstado;

  return {
    id: leasing.id,
    numero: leasing.numero,
    codigo: formatLeasingCodigo(leasing.numero),
    propietarioId: leasing.propietarioId,
    vinculado: Boolean(leasing.propietario),
    movil: leasing.propietario?.vehicleNumber ?? leasing.movilSnapshot,
    razonSocial: leasing.propietario?.fullName ?? leasing.razonSocialSnapshot,
    rut: leasing.propietario?.rut ?? leasing.rutSnapshot,
    montoTotal,
    totalPagado,
    saldo: estado === "ANULADO" ? 0 : montoTotal - totalPagado,
    cantidadCuotas: leasing.cantidadCuotas,
    cuotasPagadas: vigentes.filter((cuota) => cuota.estado === "PAGADA").length,
    cuotasPendientes: vigentes.filter(
      (cuota) => cuota.estado === "PENDIENTE" || cuota.estado === "PAGADA_PARCIAL",
    ).length,
    cuotasVencidas,
    proximoVencimiento: proxima?.fechaVencimiento ?? null,
    estado,
    estadoVisible: getLeasingEstadoVisible(estado, cuotasVencidas),
    fechaInicio: toDateOnly(leasing.fechaInicio) ?? "",
    diaCorte: leasing.diaCorte,
    createdAt: leasing.createdAt.toISOString(),
  };
}

async function calcularIndicadores(
  where: Prisma.LeasingWhereInput,
  today: string,
): Promise<LeasingIndicadoresDto> {
  const whereIndicadores: Prisma.LeasingWhereInput = {
    AND: [where, { estado: { in: INDICADOR_ESTADOS } }],
  };
  const cuotaBase: Prisma.LeasingCuotaWhereInput = {
    leasing: { is: whereIndicadores },
    estado: { not: "ANULADA" },
  };
  const todayDate = dateFromOnly(today);
  const in30Days = dateFromOnly(addDays(today, 30));

  const [financiado, cobrado, pendientes, vencidas, proximos, archivos] =
    await Promise.all([
      prisma.leasing.aggregate({ where: whereIndicadores, _sum: { montoTotal: true } }),
      prisma.leasingCuota.aggregate({ where: cuotaBase, _sum: { montoPagado: true } }),
      prisma.leasingCuota.count({
        where: { ...cuotaBase, estado: { in: CUOTA_CON_SALDO } },
      }),
      prisma.leasingCuota.aggregate({
        where: {
          ...cuotaBase,
          estado: { in: CUOTA_CON_SALDO },
          fechaVencimiento: { lt: todayDate },
        },
        _count: { _all: true },
        _sum: { montoOriginal: true, montoPagado: true },
      }),
      prisma.leasingCuota.count({
        where: {
          ...cuotaBase,
          estado: { in: CUOTA_CON_SALDO },
          fechaVencimiento: { gte: todayDate, lte: in30Days },
        },
      }),
      prisma.leasingArchivo.aggregate({ _sum: { tamano: true } }),
    ]);

  const totalFinanciado = toPesos(financiado._sum.montoTotal);
  const totalCobrado = toPesos(cobrado._sum.montoPagado);

  return {
    totalFinanciado,
    totalCobrado,
    saldoPendiente: totalFinanciado - totalCobrado,
    cuotasPendientes: pendientes,
    cuotasVencidas: vencidas._count._all,
    montoVencido:
      toPesos(vencidas._sum.montoOriginal) - toPesos(vencidas._sum.montoPagado),
    proximosVencimientos: proximos,
    espacioComprobantesBytes: archivos._sum.tamano ?? 0,
  };
}

export async function listarLeasings(filtros: LeasingFiltros): Promise<LeasingListadoDto> {
  await revincularLeasingsHuerfanos();

  const today = getLeasingToday();
  const where = buildLeasingWhere(filtros, today);
  const [total, leasings, indicadores] = await Promise.all([
    prisma.leasing.count({ where }),
    prisma.leasing.findMany({
      where,
      include: resumenInclude,
      orderBy: { numero: "desc" },
      skip: (filtros.page - 1) * LEASING_PAGE_SIZE,
      take: LEASING_PAGE_SIZE,
    }),
    calcularIndicadores(where, today),
  ]);

  return {
    leasings: leasings.map((leasing) => toLeasingResumen(leasing, today)),
    total,
    page: filtros.page,
    pageSize: LEASING_PAGE_SIZE,
    indicadores,
  };
}

// ---------------------------------------------------------------------------
// Detalle
// ---------------------------------------------------------------------------

export async function obtenerLeasingDetalle(id: string): Promise<LeasingDetalleDto | null> {
  await revincularLeasingsHuerfanos();

  const leasing = await prisma.leasing.findUnique({
    where: { id },
    include: {
      propietario: {
        select: {
          vehicleNumber: true,
          fullName: true,
          rut: true,
          firstName: true,
          lastName: true,
          secondLastName: true,
          email: true,
        },
      },
      cuotas: {
        orderBy: { numeroCuota: "asc" },
        include: {
          pagos: {
            orderBy: { createdAt: "desc" },
            include: {
              comprobante: {
                select: { nombreOriginal: true, mimeType: true, tamano: true, origen: true },
              },
              notificaciones: { orderBy: { createdAt: "desc" } },
            },
          },
        },
      },
    },
  });

  if (!leasing) {
    return null;
  }

  const today = getLeasingToday();
  const resumen = toLeasingResumen(
    {
      ...leasing,
      propietario: leasing.propietario
        ? {
            vehicleNumber: leasing.propietario.vehicleNumber,
            fullName: leasing.propietario.fullName,
            rut: leasing.propietario.rut,
          }
        : null,
      cuotas: leasing.cuotas.map((cuota) => ({
        estado: cuota.estado,
        fechaVencimiento: cuota.fechaVencimiento,
        montoOriginal: cuota.montoOriginal,
        montoPagado: cuota.montoPagado,
      })),
    },
    today,
  );

  return {
    ...resumen,
    observaciones: leasing.observaciones,
    motivoEstado: leasing.motivoEstado,
    createdByEmail: leasing.createdByEmail,
    propietarioNombre: leasing.propietario ? getPropietarioNombre(leasing.propietario) : "",
    propietarioEmail: leasing.propietario?.email ?? "",
    cuotas: leasing.cuotas.map((cuota) => {
      const estado = cuota.estado as LeasingCuotaEstado;
      const fechaVencimiento = toDateOnly(cuota.fechaVencimiento) ?? "";
      const montoOriginal = toPesos(cuota.montoOriginal);
      const montoPagado = toPesos(cuota.montoPagado);

      return {
        id: cuota.id,
        numeroCuota: cuota.numeroCuota,
        fechaVencimiento,
        montoOriginal,
        montoPagado,
        saldo: estado === "ANULADA" ? 0 : montoOriginal - montoPagado,
        estado,
        estadoVisible: getCuotaEstadoVisible({ estado, fechaVencimiento }, today),
        fechaUltimoPago: toDateOnly(cuota.fechaUltimoPago),
        pagos: cuota.pagos.map((pago) => ({
          id: pago.id,
          cuotaId: pago.cuotaId,
          fechaPago: toDateOnly(pago.fechaPago) ?? "",
          monto: toPesos(pago.monto),
          medioPago: pago.medioPago as LeasingMedioPago,
          numeroOperacion: pago.numeroOperacion,
          banco: pago.banco,
          observaciones: pago.observaciones,
          estado: pago.estado,
          createdByEmail: pago.createdByEmail,
          createdAt: pago.createdAt.toISOString(),
          anuladoByEmail: pago.anuladoByEmail,
          anuladoAt: pago.anuladoAt?.toISOString() ?? null,
          motivoAnulacion: pago.motivoAnulacion,
          comprobante: pago.comprobante,
          correos: pago.notificaciones.map((notificacion) => ({
            id: notificacion.id,
            tipo: notificacion.tipo,
            estado: notificacion.estado,
            destinatario: notificacion.destinatario,
            cantidadIntentos: notificacion.cantidadIntentos,
            ultimoError: notificacion.ultimoError,
            enviadoAt: notificacion.enviadoAt?.toISOString() ?? null,
            createdAt: notificacion.createdAt.toISOString(),
          })),
        })),
      };
    }),
  };
}

// ---------------------------------------------------------------------------
// Creación
// ---------------------------------------------------------------------------

export type CrearLeasingInput = {
  propietarioId: string;
  montoTotal: number;
  fechaInicio: string;
  cantidadCuotas: number;
  diaCorte: number;
  observaciones: string;
  confirmar: boolean;
};

export function parseCrearLeasingBody(body: unknown): CrearLeasingInput {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;

  return {
    propietarioId: typeof value.propietarioId === "string" ? value.propietarioId.trim() : "",
    montoTotal: Number(value.montoTotal),
    fechaInicio: typeof value.fechaInicio === "string" ? value.fechaInicio.trim() : "",
    cantidadCuotas: Number(value.cantidadCuotas),
    diaCorte: Number(value.diaCorte),
    observaciones: sanitizeLeasingText(value.observaciones, 1000),
    confirmar: value.confirmar === true,
  };
}

export async function crearLeasing(input: CrearLeasingInput, actor: LeasingActor) {
  const calculoError = validateLeasingCalculoInput(input);

  if (calculoError) {
    throw new LeasingOperationError(calculoError);
  }

  if (!input.propietarioId) {
    throw new LeasingOperationError("Selecciona un propietario desde el buscador.");
  }

  const propietario = await prisma.propietario.findUnique({
    where: { id: input.propietarioId },
    select: propietarioSelect,
  });

  if (!propietario) {
    throw new LeasingOperationError("El propietario seleccionado ya no existe.", 404);
  }

  const motivo = getMotivoNoElegible(propietario);

  if (motivo) {
    throw new LeasingOperationError(motivo);
  }

  const cuotas = generarCuotasLeasing(input);
  const estado: LeasingEstado = input.confirmar ? "ACTIVO" : "BORRADOR";

  return prisma.$transaction(async (tx) => {
    const created = await tx.leasing.create({
      data: {
        propietarioId: propietario.id,
        propietarioImportKey: propietario.importKey,
        razonSocialSnapshot: propietario.fullName,
        rutSnapshot: propietario.rut,
        movilSnapshot: propietario.vehicleNumber,
        montoTotal: new Prisma.Decimal(input.montoTotal),
        fechaInicio: dateFromOnly(input.fechaInicio),
        cantidadCuotas: input.cantidadCuotas,
        diaCorte: input.diaCorte,
        estado,
        observaciones: input.observaciones,
        createdByEmail: actor.email,
        createdByAccessUserId: actor.accessUserId,
        cuotas: {
          create: cuotas.map((cuota) => ({
            numeroCuota: cuota.numeroCuota,
            fechaVencimiento: dateFromOnly(cuota.fechaVencimiento),
            montoOriginal: new Prisma.Decimal(cuota.montoOriginal),
          })),
        },
      },
      select: { id: true, numero: true },
    });

    await writeLeasingAudit(tx, {
      actor,
      accion: "LEASING_CREADO",
      leasingId: created.id,
      valoresNuevos: {
        codigo: formatLeasingCodigo(created.numero),
        propietarioId: propietario.id,
        movil: propietario.vehicleNumber,
        rut: propietario.rut,
        montoTotal: input.montoTotal,
        cantidadCuotas: input.cantidadCuotas,
        fechaInicio: input.fechaInicio,
        diaCorte: input.diaCorte,
        estado,
      },
    });

    return created;
  });
}

// ---------------------------------------------------------------------------
// Cambios de estado
// ---------------------------------------------------------------------------

export type LeasingAccionEstado =
  | "confirmar"
  | "suspender"
  | "reactivar"
  | "anular"
  | "observaciones";

export async function cambiarEstadoLeasing(
  leasingId: string,
  accion: LeasingAccionEstado,
  input: { motivo: string; observaciones: string },
  actor: LeasingActor,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Leasing" WHERE "id" = ${leasingId} FOR UPDATE`;

    const leasing = await tx.leasing.findUnique({
      where: { id: leasingId },
      include: { cuotas: { select: { id: true, estado: true } } },
    });

    if (!leasing) {
      throw new LeasingOperationError("Leasing no encontrado.", 404);
    }

    const anterior = { estado: leasing.estado, observaciones: leasing.observaciones };
    const requiereMotivo = accion === "suspender" || accion === "anular";

    if (requiereMotivo && input.motivo.length < 5) {
      throw new LeasingOperationError("Indica un motivo de al menos 5 caracteres.");
    }

    if (accion === "observaciones") {
      await tx.leasing.update({
        where: { id: leasingId },
        data: {
          observaciones: input.observaciones,
          updatedByEmail: actor.email,
          updatedByAccessUserId: actor.accessUserId,
        },
      });
    } else if (accion === "confirmar") {
      if (leasing.estado !== "BORRADOR") {
        throw new LeasingOperationError("Solo se puede confirmar un leasing en borrador.");
      }

      await tx.leasing.update({
        where: { id: leasingId },
        data: { estado: "ACTIVO", updatedByEmail: actor.email, updatedByAccessUserId: actor.accessUserId },
      });
    } else if (accion === "suspender") {
      if (leasing.estado !== "ACTIVO") {
        throw new LeasingOperationError("Solo se puede suspender un leasing activo.");
      }

      await tx.leasing.update({
        where: { id: leasingId },
        data: {
          estado: "SUSPENDIDO",
          motivoEstado: input.motivo,
          updatedByEmail: actor.email,
          updatedByAccessUserId: actor.accessUserId,
        },
      });
    } else if (accion === "reactivar") {
      if (leasing.estado !== "SUSPENDIDO") {
        throw new LeasingOperationError("Solo se puede reactivar un leasing suspendido.");
      }

      await tx.leasing.update({
        where: { id: leasingId },
        data: {
          estado: calcularEstadoLeasing(
            "ACTIVO",
            leasing.cuotas.map((cuota) => ({ estado: cuota.estado as LeasingCuotaEstado })),
          ),
          motivoEstado: "",
          updatedByEmail: actor.email,
          updatedByAccessUserId: actor.accessUserId,
        },
      });
    } else if (accion === "anular") {
      if (!VIGENTE_ESTADOS.includes(leasing.estado as LeasingEstado)) {
        throw new LeasingOperationError("Este leasing no se puede anular.");
      }

      const pagosActivos = await tx.leasingPago.count({
        where: { leasingId, estado: "ACTIVO" },
      });

      if (pagosActivos > 0) {
        throw new LeasingOperationError(
          "No se puede anular un leasing con pagos activos. Anula primero los pagos.",
        );
      }

      await tx.leasingCuota.updateMany({
        where: { leasingId },
        data: { estado: "ANULADA" },
      });
      await tx.leasing.update({
        where: { id: leasingId },
        data: {
          estado: "ANULADO",
          motivoEstado: input.motivo,
          updatedByEmail: actor.email,
          updatedByAccessUserId: actor.accessUserId,
        },
      });
    }

    await writeLeasingAudit(tx, {
      actor,
      accion: `LEASING_${accion.toUpperCase()}`,
      leasingId,
      valoresAnteriores: anterior,
      valoresNuevos: {
        accion,
        motivo: input.motivo,
        observaciones: accion === "observaciones" ? input.observaciones : undefined,
      },
    });
  });
}

// ---------------------------------------------------------------------------
// Pagos
// ---------------------------------------------------------------------------

async function recalcularCuotaYLeasing(tx: Tx, cuotaId: string, leasingId: string) {
  const cuota = await tx.leasingCuota.findUniqueOrThrow({
    where: { id: cuotaId },
    select: { montoOriginal: true },
  });
  const agregado = await tx.leasingPago.aggregate({
    where: { cuotaId, estado: "ACTIVO" },
    _sum: { monto: true },
    _max: { fechaPago: true },
  });
  const montoPagado = toPesos(agregado._sum.monto);
  const estadoCuota = calcularEstadoCuota(toPesos(cuota.montoOriginal), montoPagado);

  await tx.leasingCuota.update({
    where: { id: cuotaId },
    data: {
      montoPagado: new Prisma.Decimal(montoPagado),
      estado: estadoCuota,
      fechaUltimoPago: agregado._max.fechaPago ?? null,
    },
  });

  const leasing = await tx.leasing.findUniqueOrThrow({
    where: { id: leasingId },
    select: { estado: true, cuotas: { select: { estado: true } } },
  });
  const siguiente = calcularEstadoLeasing(
    leasing.estado as LeasingEstado,
    leasing.cuotas.map((item) => ({ estado: item.estado as LeasingCuotaEstado })),
  );

  if (siguiente !== leasing.estado) {
    await tx.leasing.update({ where: { id: leasingId }, data: { estado: siguiente } });
  }

  return { estadoCuota, montoPagado, estadoLeasing: siguiente };
}

export type RegistrarPagoInput = {
  cuotaId: string;
  fechaPago: string;
  monto: number;
  medioPago: LeasingMedioPago;
  numeroOperacion: string;
  banco: string;
  observaciones: string;
  idempotencyKey: string;
};

export function parseRegistrarPagoForm(form: FormData): RegistrarPagoInput {
  const read = (key: string) => {
    const value = form.get(key);
    return typeof value === "string" ? value : "";
  };
  const medio = read("medioPago") as LeasingMedioPago;
  const banco = read("banco").trim();

  return {
    cuotaId: read("cuotaId").trim(),
    fechaPago: read("fechaPago").trim(),
    monto: Number(read("monto").replace(/\D/g, "")),
    medioPago: LEASING_MEDIOS_PAGO.includes(medio) ? medio : ("" as LeasingMedioPago),
    numeroOperacion: sanitizeLeasingText(read("numeroOperacion"), 80),
    banco: isLeasingBancoValido(banco) ? banco : "",
    observaciones: sanitizeLeasingText(read("observaciones"), 1000),
    idempotencyKey: read("idempotencyKey").trim().slice(0, 80),
  };
}

export function validateRegistrarPagoInput(input: RegistrarPagoInput, today: string) {
  if (!input.cuotaId) {
    return "Cuota no válida.";
  }

  if (!isValidLeasingDate(input.fechaPago)) {
    return "Ingresa la fecha efectiva del pago.";
  }

  if (input.fechaPago > today) {
    return "La fecha del pago no puede ser futura.";
  }

  if (!Number.isSafeInteger(input.monto) || input.monto <= 0) {
    return "Ingresa un monto pagado mayor que cero.";
  }

  if (!input.medioPago) {
    return "Selecciona el medio de pago.";
  }

  if (LEASING_MEDIOS_CON_BANCO.includes(input.medioPago) && !input.banco) {
    return "Selecciona el banco: Banco De Chile, BCI o Scotiabank.";
  }

  if (input.idempotencyKey.length < 8) {
    return "Solicitud inválida. Recarga la página e intenta nuevamente.";
  }

  return null;
}

export async function registrarPagoLeasing(
  leasingId: string,
  input: RegistrarPagoInput,
  comprobante: ValidatedLeasingComprobante,
  actor: LeasingActor,
) {
  const [existente, repetido, leasingInfo] = await Promise.all([
    prisma.leasingPago.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
      select: { id: true, notificaciones: { where: { tipo: "CONFIRMACION_PAGO" }, select: { id: true } } },
    }),
    prisma.leasingComprobante.findFirst({
      where: { hashArchivo: comprobante.hash, pago: { estado: "ACTIVO" } },
      select: {
        pago: {
          select: {
            fechaPago: true,
            cuota: { select: { numeroCuota: true } },
            leasing: { select: { numero: true } },
          },
        },
      },
    }),
    prisma.leasing.findUnique({
      where: { id: leasingId },
      select: { propietarioId: true, propietario: { select: { email: true } } },
    }),
  ]);

  if (existente) {
    return {
      pagoId: existente.id,
      notificacionId: existente.notificaciones[0]?.id ?? null,
      duplicado: true,
    };
  }

  if (repetido) {
    throw new LeasingOperationError(
      `Este comprobante ya está registrado en el pago del ${
        toDateOnly(repetido.pago.fechaPago)?.split("-").reverse().join("-") ?? ""
      } (cuota ${repetido.pago.cuota.numeroCuota}, ${formatLeasingCodigo(
        repetido.pago.leasing.numero,
      )}).`,
      409,
    );
  }

  if (!leasingInfo) {
    throw new LeasingOperationError("Leasing no encontrado.", 404);
  }

  const storage = getLeasingStorageProvider();

  try {
    return await prisma.$transaction(
      async (tx) => {
        const [bloqueo] = await tx.$queryRaw<
          Array<{
            leasingEstado: string;
            cuotaEstado: string;
            montoOriginal: string;
            montoPagado: string;
            fechaUltimoPago: string | null;
            otrasPendientes: number;
          }>
        >`
          SELECT l."estado"::text AS "leasingEstado",
                 c."estado"::text AS "cuotaEstado",
                 c."montoOriginal"::text AS "montoOriginal",
                 c."montoPagado"::text AS "montoPagado",
                 to_char(c."fechaUltimoPago", 'YYYY-MM-DD') AS "fechaUltimoPago",
                 (SELECT count(*)::int FROM "LeasingCuota" o
                   WHERE o."leasingId" = l."id" AND o."id" <> c."id"
                     AND o."estado"::text NOT IN ('PAGADA', 'ANULADA')) AS "otrasPendientes"
          FROM "Leasing" l
          JOIN "LeasingCuota" c ON c."leasingId" = l."id"
          WHERE l."id" = ${leasingId} AND c."id" = ${input.cuotaId}
          FOR UPDATE OF l`;

        if (!bloqueo) {
          throw new LeasingOperationError("La cuota no pertenece a este leasing.", 404);
        }

        if (bloqueo.leasingEstado !== "ACTIVO") {
          throw new LeasingOperationError("Solo se pueden registrar cobros en leasing activos.");
        }

        if (bloqueo.cuotaEstado === "ANULADA") {
          throw new LeasingOperationError("La cuota está anulada.");
        }

        const montoOriginal = Number(bloqueo.montoOriginal);
        const montoPagadoAnterior = Number(bloqueo.montoPagado);
        const saldo = montoOriginal - montoPagadoAnterior;

        if (saldo <= 0) {
          throw new LeasingOperationError("Esta cuota ya está pagada.");
        }

        if (input.monto > saldo) {
          throw new LeasingOperationError(
            `El monto supera el saldo pendiente de la cuota (${new Intl.NumberFormat("es-CL", {
              style: "currency",
              currency: "CLP",
              maximumFractionDigits: 0,
            }).format(saldo)}).`,
          );
        }

        const stored = await storage.upload(
          { buffer: comprobante.buffer, mimeType: comprobante.mimeType, hash: comprobante.hash },
          tx,
        );

        const pago = await tx.leasingPago.create({
          data: {
            leasingId,
            cuotaId: input.cuotaId,
            fechaPago: dateFromOnly(input.fechaPago),
            monto: new Prisma.Decimal(input.monto),
            medioPago: input.medioPago,
            numeroOperacion: input.numeroOperacion,
            banco: input.banco,
            observaciones: input.observaciones,
            idempotencyKey: input.idempotencyKey,
            createdByEmail: actor.email,
            createdByAccessUserId: actor.accessUserId,
            comprobante: {
              create: {
                archivoId: stored.archivoId,
                nombreOriginal: comprobante.nombreOriginal,
                mimeType: comprobante.mimeType,
                tamano: comprobante.tamano,
                hashArchivo: comprobante.hash,
                storageKey: stored.storageKey,
                origen: comprobante.origen,
                createdByEmail: actor.email,
              },
            },
          },
          select: { id: true },
        });

        const montoPagado = montoPagadoAnterior + input.monto;
        const estadoCuota = calcularEstadoCuota(montoOriginal, montoPagado);
        const fechaUltimoPago =
          bloqueo.fechaUltimoPago && bloqueo.fechaUltimoPago > input.fechaPago
            ? bloqueo.fechaUltimoPago
            : input.fechaPago;

        await tx.leasingCuota.update({
          where: { id: input.cuotaId },
          data: {
            montoPagado: new Prisma.Decimal(montoPagado),
            estado: estadoCuota,
            fechaUltimoPago: dateFromOnly(fechaUltimoPago),
          },
          select: { id: true },
        });

        const estadoLeasing: LeasingEstado =
          estadoCuota === "PAGADA" && bloqueo.otrasPendientes === 0 ? "PAGADO" : "ACTIVO";

        if (estadoLeasing === "PAGADO") {
          await tx.leasing.update({
            where: { id: leasingId },
            data: { estado: "PAGADO" },
            select: { id: true },
          });
        }

        await writeLeasingAudit(tx, {
          actor,
          accion: "PAGO_REGISTRADO",
          leasingId,
          cuotaId: input.cuotaId,
          pagoId: pago.id,
          valoresAnteriores: { saldoCuota: saldo, estadoCuota: bloqueo.cuotaEstado },
          valoresNuevos: {
            monto: input.monto,
            fechaPago: input.fechaPago,
            medioPago: input.medioPago,
            numeroOperacion: input.numeroOperacion,
            estadoCuota,
            estadoLeasing,
            comprobanteHash: comprobante.hash,
          },
        });

        const destinatario = leasingInfo.propietario?.email.trim() ?? "";
        const correoValido = emailPattern.test(destinatario);
        const notificacion = await tx.leasingNotificacion.create({
          data: {
            leasingId,
            pagoId: pago.id,
            confirmacionPagoId: pago.id,
            propietarioId: leasingInfo.propietarioId,
            destinatario,
            tipo: "CONFIRMACION_PAGO",
            asunto: "",
            estado: correoValido ? "PENDIENTE" : "FALLIDO",
            ultimoError: correoValido ? "" : "El propietario no tiene un correo válido registrado.",
            createdByEmail: actor.email,
          },
          select: { id: true },
        });

        return { pagoId: pago.id, notificacionId: notificacion.id, duplicado: false };
      },
      { timeout: 20_000 },
    );
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const pago = await prisma.leasingPago.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });

      if (pago) {
        return { pagoId: pago.id, notificacionId: null, duplicado: true };
      }
    }

    throw error;
  }
}

export async function anularPagoLeasing(
  pagoId: string,
  motivo: string,
  actor: LeasingActor,
) {
  if (motivo.length < 5) {
    throw new LeasingOperationError("Indica un motivo de anulación de al menos 5 caracteres.");
  }

  const referencia = await prisma.leasingPago.findUnique({
    where: { id: pagoId },
    select: { leasingId: true, cuotaId: true },
  });

  if (!referencia) {
    throw new LeasingOperationError("Pago no encontrado.", 404);
  }

  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Leasing" WHERE "id" = ${referencia.leasingId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "LeasingCuota" WHERE "id" = ${referencia.cuotaId} FOR UPDATE`;

    const pago = await tx.leasingPago.findUniqueOrThrow({
      where: { id: pagoId },
      select: { estado: true, monto: true, fechaPago: true },
    });

    if (pago.estado !== "ACTIVO") {
      throw new LeasingOperationError("Este pago ya está anulado.");
    }

    await tx.leasingPago.update({
      where: { id: pagoId },
      data: {
        estado: "ANULADO",
        anuladoAt: new Date(),
        anuladoByEmail: actor.email,
        motivoAnulacion: motivo,
      },
    });

    const recalculo = await recalcularCuotaYLeasing(
      tx,
      referencia.cuotaId,
      referencia.leasingId,
    );

    await writeLeasingAudit(tx, {
      actor,
      accion: "PAGO_ANULADO",
      leasingId: referencia.leasingId,
      cuotaId: referencia.cuotaId,
      pagoId,
      valoresAnteriores: {
        estado: "ACTIVO",
        monto: toPesos(pago.monto),
        fechaPago: toDateOnly(pago.fechaPago),
      },
      valoresNuevos: {
        estado: "ANULADO",
        motivo,
        estadoCuota: recalculo.estadoCuota,
        estadoLeasing: recalculo.estadoLeasing,
      },
    });
  });
}
