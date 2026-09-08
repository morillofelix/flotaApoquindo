-- Permiso independiente. El valor por defecto conserva sin acceso a los usuarios existentes.
ALTER TABLE "AccessUser"
ADD COLUMN "canHistorial" BOOLEAN NOT NULL DEFAULT false;

-- Historial aditivo de cambios de propietarios.
CREATE TABLE "PropietarioHistory" (
    "id" TEXT NOT NULL,
    "propietarioId" TEXT,
    "actorAccessUserId" TEXT,
    "actorName" TEXT NOT NULL DEFAULT '',
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "movementType" TEXT NOT NULL,
    "propietarioName" TEXT NOT NULL,
    "propietarioRut" TEXT NOT NULL DEFAULT '',
    "vehicleNumber" TEXT NOT NULL DEFAULT '',
    "changes" JSONB NOT NULL,
    "changedFields" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "previousStatus" TEXT NOT NULL DEFAULT '',
    "newStatus" TEXT NOT NULL DEFAULT '',
    "notificationStatus" TEXT NOT NULL DEFAULT 'not_required',
    "notificationUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropietarioHistory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PropietarioHistory_createdAt_idx"
ON "PropietarioHistory"("createdAt");

CREATE INDEX "PropietarioHistory_propietarioId_createdAt_idx"
ON "PropietarioHistory"("propietarioId", "createdAt");

CREATE INDEX "PropietarioHistory_propietarioRut_createdAt_idx"
ON "PropietarioHistory"("propietarioRut", "createdAt");

CREATE INDEX "PropietarioHistory_vehicleNumber_createdAt_idx"
ON "PropietarioHistory"("vehicleNumber", "createdAt");

CREATE INDEX "PropietarioHistory_actorAccessUserId_createdAt_idx"
ON "PropietarioHistory"("actorAccessUserId", "createdAt");

CREATE INDEX "PropietarioHistory_movementType_createdAt_idx"
ON "PropietarioHistory"("movementType", "createdAt");

CREATE INDEX "PropietarioHistory_newStatus_createdAt_idx"
ON "PropietarioHistory"("newStatus", "createdAt");

CREATE INDEX "PropietarioHistory_changedFields_idx"
ON "PropietarioHistory" USING GIN ("changedFields");

ALTER TABLE "PropietarioHistory"
ADD CONSTRAINT "PropietarioHistory_propietarioId_fkey"
FOREIGN KEY ("propietarioId") REFERENCES "Propietario"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PropietarioHistory"
ADD CONSTRAINT "PropietarioHistory_actorAccessUserId_fkey"
FOREIGN KEY ("actorAccessUserId") REFERENCES "AccessUser"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
