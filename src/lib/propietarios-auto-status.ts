import { diffPropietarioChanges } from "@/lib/propietarios-changes";
import { displayVehicleNumber, toPropietario } from "@/lib/propietarios";
import { notifyPropietarioUpdateSafely } from "@/lib/propietarios-notify-mail";
import {
  formatDateValue,
  getSantiagoDateString,
} from "@/lib/propietario-status";
import { prisma } from "@/lib/prisma";

export async function applyExpiredDesvinculaciones() {
  const today = getSantiagoDateString();
  const referenceDate = new Date(`${today}T12:00:00`);

  const expired = await prisma.propietario.findMany({
    where: {
      status: "desvinculado",
      desvinculadoUntil: {
        not: null,
        lte: referenceDate,
      },
    },
  });

  for (const record of expired) {
    const updated = await prisma.propietario.update({
      where: { id: record.id },
      data: {
        status: "activo",
        isActive: true,
        inactiveReason: "",
        desvinculacionReason: "",
        desvinculacionDays: 0,
        desvinculadoUntil: null,
        activationReason:
          "Reactivación automática al vencer el plazo de desvinculación.",
      },
    });

    const changes = diffPropietarioChanges(record, updated);

    await notifyPropietarioUpdateSafely({
      actor: "Sistema automático",
      fullName: updated.fullName,
      rut: updated.rut,
      vehicleNumber: displayVehicleNumber(updated.vehicleNumber),
      changes,
      activationReason: `Reactivación automática. El plazo de desvinculación venció el ${formatDateValue(record.desvinculadoUntil)}.`,
      desvinculacionReason: record.desvinculacionReason?.trim() || undefined,
    });
  }

  return expired.length;
}

export async function listPropietariosWithAutoStatus() {
  await applyExpiredDesvinculaciones();

  const propietarios = await prisma.propietario.findMany({
    orderBy: [{ fullName: "asc" }],
  });

  return propietarios.map(toPropietario);
}
