import {
  type Appointment,
  type AppointmentStatus,
  type Executive,
  type PermitType,
  type PermissionReason,
  appointmentReasonUsesPermitDetails,
  appointmentReasonUsesDateRange,
  executives,
  permissionReasons,
} from "@/lib/appointments";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type AppointmentCreateBody = {
  id?: unknown;
  driverName?: unknown;
  vehicleNumber?: unknown;
  appointmentDate?: unknown;
  appointmentReason?: unknown;
  vacationStartDate?: unknown;
  vacationEndDate?: unknown;
  permitType?: unknown;
  permitStartDate?: unknown;
  permitEndDate?: unknown;
  permitDate?: unknown;
  permitStartTime?: unknown;
  permitEndTime?: unknown;
  email?: unknown;
  phone?: unknown;
};

const validStatuses: AppointmentStatus[] = [
  "pendiente",
  "revisado",
  "aprobado",
  "rechazado",
];

function isValidExecutive(value: string): value is Executive {
  return executives.some((executive) => executive === value);
}

function isValidAppointmentReason(value: string): value is PermissionReason {
  return permissionReasons.some((reason) => reason.value === value);
}

function isValidAppointmentDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(date.getTime());
}

function isValidPermitType(value: string): value is PermitType {
  return value === "dias" || value === "horas";
}

function isValidTime(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeVehicleNumber(value: string) {
  return value.trim().padStart(3, "0");
}

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function formatDateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function toAppointment(value: {
  id: string;
  driverName: string;
  vehicleNumber: string;
  appointmentDate: Date;
  vacationStartDate: Date | null;
  vacationEndDate: Date | null;
  permitType: string;
  permitStartDate: Date | null;
  permitEndDate: Date | null;
  permitDate: Date | null;
  permitStartTime: string;
  permitEndTime: string;
  appointmentReason: string;
  email: string;
  phone: string;
  assignedExecutive: string;
  status: string;
  createdAt: Date;
}): Appointment {
  const status = validStatuses.includes(value.status as AppointmentStatus)
    ? (value.status as AppointmentStatus)
    : "pendiente";

  return {
    id: value.id,
    driverName: value.driverName,
    vehicleNumber: value.vehicleNumber,
    appointmentDate: formatDateOnly(value.appointmentDate),
    vacationStartDate: value.vacationStartDate
      ? formatDateOnly(value.vacationStartDate)
      : "",
    vacationEndDate: value.vacationEndDate
      ? formatDateOnly(value.vacationEndDate)
      : "",
    permitType: isValidPermitType(value.permitType) ? value.permitType : "",
    permitStartDate: value.permitStartDate
      ? formatDateOnly(value.permitStartDate)
      : "",
    permitEndDate: value.permitEndDate ? formatDateOnly(value.permitEndDate) : "",
    permitDate: value.permitDate ? formatDateOnly(value.permitDate) : "",
    permitStartTime: value.permitStartTime,
    permitEndTime: value.permitEndTime,
    appointmentReason: isValidAppointmentReason(value.appointmentReason)
      ? value.appointmentReason
      : "otros",
    email: value.email,
    phone: value.phone,
    assignedExecutive: isValidExecutive(value.assignedExecutive)
      ? value.assignedExecutive
      : "",
    status,
    createdAt: value.createdAt.toISOString(),
  };
}

function validateCreateBody(body: AppointmentCreateBody) {
  const id = typeof body.id === "string" ? body.id.trim() : "";
  const driverName =
    typeof body.driverName === "string" ? body.driverName.trim() : "";
  const vehicleNumber =
    typeof body.vehicleNumber === "string" ? body.vehicleNumber.trim() : "";
  const appointmentDate =
    typeof body.appointmentDate === "string" ? body.appointmentDate : "";
  const appointmentReason =
    typeof body.appointmentReason === "string" ? body.appointmentReason : "";
  const vacationStartDate =
    typeof body.vacationStartDate === "string" ? body.vacationStartDate : "";
  const vacationEndDate =
    typeof body.vacationEndDate === "string" ? body.vacationEndDate : "";
  const permitType = typeof body.permitType === "string" ? body.permitType : "";
  const permitStartDate =
    typeof body.permitStartDate === "string" ? body.permitStartDate : "";
  const permitEndDate =
    typeof body.permitEndDate === "string" ? body.permitEndDate : "";
  const permitDate = typeof body.permitDate === "string" ? body.permitDate : "";
  const permitStartTime =
    typeof body.permitStartTime === "string" ? body.permitStartTime : "";
  const permitEndTime =
    typeof body.permitEndTime === "string" ? body.permitEndTime : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const usesDateRange = appointmentReasonUsesDateRange(appointmentReason);
  const usesPermitDetails = appointmentReasonUsesPermitDetails(appointmentReason);

  if (
    !id ||
    !driverName ||
    !/^\d{1,3}$/.test(vehicleNumber) ||
    !isValidAppointmentDate(appointmentDate) ||
    !isValidAppointmentReason(appointmentReason) ||
    !email ||
    !phone
  ) {
    return null;
  }

  if (
    usesDateRange &&
    (!isValidAppointmentDate(vacationStartDate) ||
      !isValidAppointmentDate(vacationEndDate) ||
      vacationEndDate < vacationStartDate)
  ) {
    return null;
  }

  if (usesPermitDetails) {
    if (!isValidPermitType(permitType)) {
      return null;
    }

    if (
      permitType === "dias" &&
      (!isValidAppointmentDate(permitStartDate) ||
        !isValidAppointmentDate(permitEndDate) ||
        permitEndDate < permitStartDate)
    ) {
      return null;
    }

    if (
      permitType === "horas" &&
      (!isValidAppointmentDate(permitDate) ||
        !isValidTime(permitStartTime) ||
        !isValidTime(permitEndTime) ||
        permitEndTime <= permitStartTime)
    ) {
      return null;
    }
  }

  return {
    id,
    driverName,
    vehicleNumber: normalizeVehicleNumber(vehicleNumber),
    appointmentDate,
    vacationStartDate: usesDateRange ? vacationStartDate : "",
    vacationEndDate: usesDateRange ? vacationEndDate : "",
    permitType: usesPermitDetails ? permitType : "",
    permitStartDate:
      usesPermitDetails && permitType === "dias" ? permitStartDate : "",
    permitEndDate: usesPermitDetails && permitType === "dias" ? permitEndDate : "",
    permitDate: usesPermitDetails && permitType === "horas" ? permitDate : "",
    permitStartTime:
      usesPermitDetails && permitType === "horas" ? permitStartTime : "",
    permitEndTime: usesPermitDetails && permitType === "horas" ? permitEndTime : "",
    appointmentReason,
    email,
    phone,
  };
}

export async function GET() {
  const appointments = await prisma.appointment.findMany({
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    appointments: appointments.map(toAppointment),
  });
}

export async function POST(request: NextRequest) {
  let body: AppointmentCreateBody;

  try {
    body = (await request.json()) as AppointmentCreateBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const appointment = validateCreateBody(body);

  if (!appointment) {
    return NextResponse.json(
      { message: "Datos de solicitud incompletos." },
      { status: 400 },
    );
  }

  try {
    const createdAppointment = await prisma.appointment.create({
      data: {
        ...appointment,
        appointmentDate: toDateOnly(appointment.appointmentDate),
        vacationStartDate: appointment.vacationStartDate
          ? toDateOnly(appointment.vacationStartDate)
          : null,
        vacationEndDate: appointment.vacationEndDate
          ? toDateOnly(appointment.vacationEndDate)
          : null,
        permitStartDate: appointment.permitStartDate
          ? toDateOnly(appointment.permitStartDate)
          : null,
        permitEndDate: appointment.permitEndDate
          ? toDateOnly(appointment.permitEndDate)
          : null,
        permitDate: appointment.permitDate ? toDateOnly(appointment.permitDate) : null,
      },
    });

    return NextResponse.json(
      { appointment: toAppointment(createdAppointment) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "No se pudo registrar la solicitud." },
      { status: 500 },
    );
  }
}
