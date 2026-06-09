import {
  type Appointment,
  type AppointmentStatus,
  type Executive,
  type PermissionReason,
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
  email?: unknown;
  phone?: unknown;
};

const validStatuses: AppointmentStatus[] = ["pendiente", "revisado", "rechazado"];

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
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";
  const isVacationRequest = appointmentReason === "vacaciones";

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
    isVacationRequest &&
    (!isValidAppointmentDate(vacationStartDate) ||
      !isValidAppointmentDate(vacationEndDate) ||
      vacationEndDate < vacationStartDate)
  ) {
    return null;
  }

  return {
    id,
    driverName,
    vehicleNumber: normalizeVehicleNumber(vehicleNumber),
    appointmentDate,
    vacationStartDate: isVacationRequest ? vacationStartDate : "",
    vacationEndDate: isVacationRequest ? vacationEndDate : "",
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
