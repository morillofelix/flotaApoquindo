-- Módulo Leasing: migración solo aditiva.
-- No elimina ni modifica tablas, columnas ni datos existentes.

-- Permisos nuevos. El valor por defecto deja sin acceso a los usuarios existentes.
ALTER TABLE "AccessUser"
ADD COLUMN "canLeasing" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canLeasingCobros" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "canLeasingAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateEnum
CREATE TYPE "LeasingEstado" AS ENUM ('BORRADOR', 'ACTIVO', 'PAGADO', 'SUSPENDIDO', 'ANULADO');

-- CreateEnum
CREATE TYPE "LeasingPeriodicidad" AS ENUM ('MENSUAL');

-- CreateEnum
CREATE TYPE "LeasingCuotaEstado" AS ENUM ('PENDIENTE', 'PAGADA_PARCIAL', 'PAGADA', 'ANULADA');

-- CreateEnum
CREATE TYPE "LeasingPagoEstado" AS ENUM ('ACTIVO', 'ANULADO');

-- CreateEnum
CREATE TYPE "LeasingMedioPago" AS ENUM ('TRANSFERENCIA', 'DEPOSITO', 'CHEQUE', 'EFECTIVO', 'OTRO');

-- CreateEnum
CREATE TYPE "LeasingNotificacionTipo" AS ENUM ('CONFIRMACION_PAGO', 'REENVIO_MANUAL');

-- CreateEnum
CREATE TYPE "LeasingNotificacionEstado" AS ENUM ('PENDIENTE', 'ENVIANDO', 'ENVIADO', 'FALLIDO');

-- CreateTable
CREATE TABLE "Leasing" (
    "id" TEXT NOT NULL,
    "numero" SERIAL NOT NULL,
    "propietarioId" TEXT,
    "propietarioImportKey" TEXT NOT NULL,
    "razonSocialSnapshot" TEXT NOT NULL,
    "rutSnapshot" TEXT NOT NULL,
    "movilSnapshot" TEXT NOT NULL,
    "montoTotal" DECIMAL(14,2) NOT NULL,
    "fechaInicio" DATE NOT NULL,
    "cantidadCuotas" INTEGER NOT NULL,
    "periodicidad" "LeasingPeriodicidad" NOT NULL DEFAULT 'MENSUAL',
    "diaCorte" INTEGER NOT NULL,
    "estado" "LeasingEstado" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT NOT NULL DEFAULT '',
    "motivoEstado" TEXT NOT NULL DEFAULT '',
    "createdByEmail" TEXT NOT NULL,
    "createdByAccessUserId" TEXT,
    "updatedByEmail" TEXT NOT NULL DEFAULT '',
    "updatedByAccessUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Leasing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeasingCuota" (
    "id" TEXT NOT NULL,
    "leasingId" TEXT NOT NULL,
    "numeroCuota" INTEGER NOT NULL,
    "fechaVencimiento" DATE NOT NULL,
    "montoOriginal" DECIMAL(14,2) NOT NULL,
    "montoPagado" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "estado" "LeasingCuotaEstado" NOT NULL DEFAULT 'PENDIENTE',
    "fechaUltimoPago" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeasingCuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeasingPago" (
    "id" TEXT NOT NULL,
    "leasingId" TEXT NOT NULL,
    "cuotaId" TEXT NOT NULL,
    "fechaPago" DATE NOT NULL,
    "monto" DECIMAL(14,2) NOT NULL,
    "medioPago" "LeasingMedioPago" NOT NULL,
    "numeroOperacion" TEXT NOT NULL DEFAULT '',
    "banco" TEXT NOT NULL DEFAULT '',
    "observaciones" TEXT NOT NULL DEFAULT '',
    "estado" "LeasingPagoEstado" NOT NULL DEFAULT 'ACTIVO',
    "idempotencyKey" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdByAccessUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "anuladoByEmail" TEXT NOT NULL DEFAULT '',
    "anuladoAt" TIMESTAMP(3),
    "motivoAnulacion" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "LeasingPago_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeasingComprobante" (
    "id" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "archivoId" TEXT NOT NULL,
    "nombreOriginal" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "tamano" INTEGER NOT NULL,
    "hashArchivo" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "origen" TEXT NOT NULL,
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeasingComprobante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeasingArchivo" (
    "id" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "contenido" BYTEA NOT NULL,
    "tamano" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeasingArchivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeasingAuditoria" (
    "id" TEXT NOT NULL,
    "leasingId" TEXT,
    "cuotaId" TEXT,
    "pagoId" TEXT,
    "accion" TEXT NOT NULL,
    "valoresAnteriores" JSONB,
    "valoresNuevos" JSONB,
    "descripcion" TEXT NOT NULL DEFAULT '',
    "usuarioEmail" TEXT NOT NULL,
    "usuarioAccessUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeasingAuditoria_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeasingNotificacion" (
    "id" TEXT NOT NULL,
    "leasingId" TEXT NOT NULL,
    "pagoId" TEXT NOT NULL,
    "confirmacionPagoId" TEXT,
    "propietarioId" TEXT,
    "destinatario" TEXT NOT NULL,
    "tipo" "LeasingNotificacionTipo" NOT NULL,
    "asunto" TEXT NOT NULL,
    "estado" "LeasingNotificacionEstado" NOT NULL DEFAULT 'PENDIENTE',
    "cantidadIntentos" INTEGER NOT NULL DEFAULT 0,
    "messageId" TEXT NOT NULL DEFAULT '',
    "ultimoError" TEXT NOT NULL DEFAULT '',
    "enviadoAt" TIMESTAMP(3),
    "createdByEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "LeasingNotificacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Leasing_numero_key" ON "Leasing"("numero");

-- CreateIndex
CREATE INDEX "Leasing_estado_idx" ON "Leasing"("estado");

-- CreateIndex
CREATE INDEX "Leasing_propietarioId_idx" ON "Leasing"("propietarioId");

-- CreateIndex
CREATE INDEX "Leasing_propietarioImportKey_idx" ON "Leasing"("propietarioImportKey");

-- CreateIndex
CREATE INDEX "Leasing_movilSnapshot_idx" ON "Leasing"("movilSnapshot");

-- CreateIndex
CREATE INDEX "Leasing_rutSnapshot_idx" ON "Leasing"("rutSnapshot");

-- CreateIndex
CREATE INDEX "Leasing_fechaInicio_idx" ON "Leasing"("fechaInicio");

-- CreateIndex
CREATE INDEX "LeasingCuota_fechaVencimiento_idx" ON "LeasingCuota"("fechaVencimiento");

-- CreateIndex
CREATE INDEX "LeasingCuota_estado_fechaVencimiento_idx" ON "LeasingCuota"("estado", "fechaVencimiento");

-- CreateIndex
CREATE UNIQUE INDEX "LeasingCuota_leasingId_numeroCuota_key" ON "LeasingCuota"("leasingId", "numeroCuota");

-- CreateIndex
CREATE UNIQUE INDEX "LeasingPago_idempotencyKey_key" ON "LeasingPago"("idempotencyKey");

-- CreateIndex
CREATE INDEX "LeasingPago_cuotaId_estado_idx" ON "LeasingPago"("cuotaId", "estado");

-- CreateIndex
CREATE INDEX "LeasingPago_leasingId_estado_idx" ON "LeasingPago"("leasingId", "estado");

-- CreateIndex
CREATE INDEX "LeasingPago_fechaPago_idx" ON "LeasingPago"("fechaPago");

-- CreateIndex
CREATE UNIQUE INDEX "LeasingComprobante_pagoId_key" ON "LeasingComprobante"("pagoId");

-- CreateIndex
CREATE INDEX "LeasingComprobante_hashArchivo_idx" ON "LeasingComprobante"("hashArchivo");

-- CreateIndex
CREATE UNIQUE INDEX "LeasingArchivo_hash_key" ON "LeasingArchivo"("hash");

-- CreateIndex
CREATE INDEX "LeasingAuditoria_leasingId_createdAt_idx" ON "LeasingAuditoria"("leasingId", "createdAt");

-- CreateIndex
CREATE INDEX "LeasingAuditoria_pagoId_idx" ON "LeasingAuditoria"("pagoId");

-- CreateIndex
CREATE INDEX "LeasingAuditoria_accion_createdAt_idx" ON "LeasingAuditoria"("accion", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeasingNotificacion_confirmacionPagoId_key" ON "LeasingNotificacion"("confirmacionPagoId");

-- CreateIndex
CREATE INDEX "LeasingNotificacion_pagoId_idx" ON "LeasingNotificacion"("pagoId");

-- CreateIndex
CREATE INDEX "LeasingNotificacion_leasingId_createdAt_idx" ON "LeasingNotificacion"("leasingId", "createdAt");

-- CreateIndex
CREATE INDEX "LeasingNotificacion_estado_idx" ON "LeasingNotificacion"("estado");

-- AddForeignKey
ALTER TABLE "Leasing" ADD CONSTRAINT "Leasing_propietarioId_fkey" FOREIGN KEY ("propietarioId") REFERENCES "Propietario"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeasingCuota" ADD CONSTRAINT "LeasingCuota_leasingId_fkey" FOREIGN KEY ("leasingId") REFERENCES "Leasing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeasingPago" ADD CONSTRAINT "LeasingPago_leasingId_fkey" FOREIGN KEY ("leasingId") REFERENCES "Leasing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeasingPago" ADD CONSTRAINT "LeasingPago_cuotaId_fkey" FOREIGN KEY ("cuotaId") REFERENCES "LeasingCuota"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeasingComprobante" ADD CONSTRAINT "LeasingComprobante_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "LeasingPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeasingComprobante" ADD CONSTRAINT "LeasingComprobante_archivoId_fkey" FOREIGN KEY ("archivoId") REFERENCES "LeasingArchivo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeasingAuditoria" ADD CONSTRAINT "LeasingAuditoria_leasingId_fkey" FOREIGN KEY ("leasingId") REFERENCES "Leasing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeasingNotificacion" ADD CONSTRAINT "LeasingNotificacion_leasingId_fkey" FOREIGN KEY ("leasingId") REFERENCES "Leasing"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeasingNotificacion" ADD CONSTRAINT "LeasingNotificacion_pagoId_fkey" FOREIGN KEY ("pagoId") REFERENCES "LeasingPago"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
