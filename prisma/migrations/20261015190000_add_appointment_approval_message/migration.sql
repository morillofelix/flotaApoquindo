-- Observación opcional del ejecutivo al aprobar una solicitud (aditivo).
ALTER TABLE "Appointment" ADD COLUMN "approvalMessage" TEXT NOT NULL DEFAULT '';
