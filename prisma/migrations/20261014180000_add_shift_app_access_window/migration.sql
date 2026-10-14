-- Horarios de acceso a solicitudes desde la app por turno y día de la semana (aditivo).
CREATE TABLE "ShiftAppAccessWindow" (
    "id" TEXT NOT NULL,
    "shiftDefinitionId" TEXT NOT NULL,
    "weekday" INTEGER NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "startTime" TEXT NOT NULL DEFAULT '',
    "endTime" TEXT NOT NULL DEFAULT '',
    "updatedByEmail" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftAppAccessWindow_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftAppAccessWindow_shiftDefinitionId_weekday_key"
ON "ShiftAppAccessWindow"("shiftDefinitionId", "weekday");

CREATE INDEX "ShiftAppAccessWindow_shiftDefinitionId_idx"
ON "ShiftAppAccessWindow"("shiftDefinitionId");

ALTER TABLE "ShiftAppAccessWindow"
ADD CONSTRAINT "ShiftAppAccessWindow_shiftDefinitionId_fkey"
FOREIGN KEY ("shiftDefinitionId") REFERENCES "ShiftDefinition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
