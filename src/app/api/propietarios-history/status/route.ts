import { parseDateValue } from "@/lib/driver-owners";
import { authorizeHistoryAdmin } from "@/lib/history-auth-server";
import { diffPropietarioChanges } from "@/lib/propietarios-changes";
import { notifyPropietarioUpdateSafely } from "@/lib/propietarios-notify-mail";
import {
  normalizePropietarioStatus,
  resolvePropietarioStatusFields,
  validatePropietarioStatusFields,
  type PropietarioStatus,
} from "@/lib/propietario-status";
import { displayVehicleNumber } from "@/lib/propietarios";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

type StatusBody = {
  propietarioId?: unknown;
  status?: unknown;
  inactiveReason?: unknown;
  activationReason?: unknown;
  desvinculacionReason?: unknown;
  desvinculacionDays?: unknown;
  expectedUpdatedAt?: unknown;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export async function PATCH(request: NextRequest) {
  const authorization = await authorizeHistoryAdmin(request, [
    "historial",
    "propietarios",
  ]);

  if (authorization.error) {
    return authorization.error;
  }

  let body: StatusBody;

  try {
    body = (await request.json()) as StatusBody;
  } catch {
    return NextResponse.json({ message: "Solicitud inválida." }, { status: 400 });
  }

  const propietarioId = stringValue(body.propietarioId);
  const rawStatus = stringValue(body.status);
  const expectedUpdatedAt = stringValue(body.expectedUpdatedAt);
  const validStatuses = new Set([
    "activo",
    "revision",
    "inactivo",
    "desvinculado",
  ]);

  if (!propietarioId || !validStatuses.has(rawStatus)) {
    return NextResponse.json(
      { message: "El propietario o el Estado no es válido." },
      { status: 400 },
    );
  }

  if (expectedUpdatedAt && Number.isNaN(Date.parse(expectedUpdatedAt))) {
    return NextResponse.json(
      { message: "La versión del registro no es válida." },
      { status: 400 },
    );
  }

  const nextStatus = rawStatus as PropietarioStatus;
  const activationReason = stringValue(body.activationReason);

  if (nextStatus === "activo" && activationReason.length < 5) {
    return NextResponse.json(
      { message: "Debes indicar el motivo de activación (mínimo 5 caracteres)." },
      { status: 400 },
    );
  }

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const existing = await transaction.propietario.findUnique({
        where: { id: propietarioId },
      });

      if (!existing) {
        throw new Error("PROPIETARIO_NOT_FOUND");
      }

      if (
        expectedUpdatedAt &&
        existing.updatedAt.toISOString() !==
          new Date(expectedUpdatedAt).toISOString()
      ) {
        throw new Error("PROPIETARIO_VERSION_CONFLICT");
      }

      const previousStatus = normalizePropietarioStatus(
        existing.status || (existing.isActive ? "activo" : "inactivo"),
      );

      if (previousStatus === nextStatus) {
        throw new Error("PROPIETARIO_SAME_STATUS");
      }

      const statusFields = resolvePropietarioStatusFields(
        {
          status: nextStatus,
          isActive: nextStatus === "activo",
          inactiveReason: stringValue(body.inactiveReason),
          desvinculacionReason: stringValue(body.desvinculacionReason),
          desvinculacionDays: body.desvinculacionDays,
        },
        existing,
      );
      const validationMessage = validatePropietarioStatusFields(statusFields);

      if (validationMessage) {
        throw new Error(`PROPIETARIO_VALIDATION:${validationMessage}`);
      }

      const updateData = {
        status: statusFields.status,
        isActive: statusFields.isActive,
        inactiveReason: statusFields.inactiveReason,
        activationReason:
          nextStatus === "activo" ? activationReason : "",
        desvinculacionReason: statusFields.desvinculacionReason,
        desvinculacionDays: statusFields.desvinculacionDays,
        desvinculadoUntil: statusFields.desvinculadoUntil
          ? parseDateValue(statusFields.desvinculadoUntil)
          : null,
      };
      const changes = diffPropietarioChanges(existing, {
        ...existing,
        ...updateData,
      });
      const updatedCount = await transaction.propietario.updateMany({
        where: {
          id: propietarioId,
          updatedAt: existing.updatedAt,
        },
        data: updateData,
      });

      if (updatedCount.count !== 1) {
        throw new Error("PROPIETARIO_VERSION_CONFLICT");
      }

      const propietario = await transaction.propietario.findUniqueOrThrow({
        where: { id: propietarioId },
      });
      const shouldNotify = nextStatus !== "revision";
      const history = await transaction.propietarioHistory.create({
        data: {
          propietarioId,
          actorAccessUserId:
            authorization.context.actorAccessUserId,
          actorName: authorization.context.actorName,
          actorEmail: authorization.context.actorEmail,
          movementType: "status_change",
          propietarioName: propietario.fullName,
          propietarioRut: propietario.rut,
          vehicleNumber: displayVehicleNumber(propietario.vehicleNumber),
          changes,
          changedFields: changes.map((change) => change.field),
          previousStatus,
          newStatus: nextStatus,
          notificationStatus: shouldNotify ? "pending" : "not_required",
        },
      });

      return {
        propietario,
        historyId: history.id,
        changes,
        shouldNotify,
        previousStatus,
        statusFields,
      };
    });

    const inactiveReasonForEmail =
      result.statusFields.status === "inactivo"
        ? result.statusFields.inactiveReason
        : undefined;
    const desvinculacionReasonForEmail =
      result.statusFields.status === "desvinculado"
        ? result.statusFields.desvinculacionReason
        : undefined;
    const activationReasonForEmail =
      result.statusFields.status === "activo"
        ? activationReason ||
          (result.previousStatus === "revision"
            ? "Activación del propietario tras finalizar la revisión inicial."
            : "Reactivación manual del registro de propietario.")
        : undefined;
    const notificationSent = result.shouldNotify
      ? await notifyPropietarioUpdateSafely({
          actor: authorization.context.actorEmail,
          fullName: result.propietario.fullName,
          rut: result.propietario.rut,
          vehicleNumber: displayVehicleNumber(result.propietario.vehicleNumber),
          changes: result.changes,
          inactiveReason: inactiveReasonForEmail,
          activationReason: activationReasonForEmail,
          desvinculacionReason: desvinculacionReasonForEmail,
          desvinculacionDays:
            result.statusFields.status === "desvinculado"
              ? result.statusFields.desvinculacionDays
              : undefined,
          desvinculadoUntil:
            result.statusFields.status === "desvinculado"
              ? result.statusFields.desvinculadoUntil
              : undefined,
        })
      : false;

    if (result.shouldNotify) {
      await prisma.propietarioHistory
        .update({
          where: { id: result.historyId },
          data: {
            notificationStatus: notificationSent ? "sent" : "failed",
            notificationUpdatedAt: new Date(),
          },
        })
        .catch((error) => {
          console.error("Propietario history notification update failed:", error);
        });
    }

    return NextResponse.json({
      propietarioId: result.propietario.id,
      status: result.statusFields.status,
      updatedAt: result.propietario.updatedAt.toISOString(),
      notificationSent,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "PROPIETARIO_NOT_FOUND") {
        return NextResponse.json(
          { message: "Registro no encontrado." },
          { status: 404 },
        );
      }

      if (error.message === "PROPIETARIO_SAME_STATUS") {
        return NextResponse.json(
          { message: "El propietario ya tiene el Estado seleccionado." },
          { status: 400 },
        );
      }

      if (error.message === "PROPIETARIO_VERSION_CONFLICT") {
        return NextResponse.json(
          {
            message:
              "El propietario fue modificado por otro usuario. Actualiza el historial antes de continuar.",
          },
          { status: 409 },
        );
      }

      if (error.message.startsWith("PROPIETARIO_VALIDATION:")) {
        return NextResponse.json(
          { message: error.message.slice("PROPIETARIO_VALIDATION:".length) },
          { status: 400 },
        );
      }
    }

    console.error("Propietario history status update failed:", error);
    return NextResponse.json(
      { message: "No se pudo actualizar el Estado del propietario." },
      { status: 500 },
    );
  }
}
