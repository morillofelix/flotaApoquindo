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
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const phone = typeof body.phone === "string" ? body.phone.trim() : "";

  if (
    !id ||
    !driverName ||
    !vehicleNumber ||
    !isValidAppointmentDate(appointmentDate) ||
    !isValidAppointmentReason(appointmentReason) ||
    !email ||
    !phone
  ) {
    return null;
  }

  return {
    id,
    driverName,
    vehicleNumber,
    appointmentDate,
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
