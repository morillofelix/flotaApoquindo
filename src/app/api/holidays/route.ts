import { DEFAULT_HOLIDAY_BUSINESS_DAYS_ADVANCE } from "@/lib/chile-holidays-2026";
import { toHolidayConfig } from "@/lib/holidays";
import { requireAdminPermission } from "@/lib/admin-api-server";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type HolidayBody = {
  id?: unknown;
  date?: unknown;
  name?: unknown;
  year?: unknown;
  scope?: unknown;
  businessDaysAdvance?: unknown;
  isActive?: unknown;
};

function parseDateOnly(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return null;
  }

  const date = new Date(`${value.trim()}T00:00:00.000Z`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return value.trim();
}

function parseBusinessDaysAdvance(value: unknown) {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return DEFAULT_HOLIDAY_BUSINESS_DAYS_ADVANCE;
  }

  return Math.min(parsed, 365);
}

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

async function loadHolidays(year?: number) {
  const holidays = await prisma.holiday.findMany({
    where: year ? { year } : undefined,
    orderBy: [{ date: "asc" }],
  });

  return holidays.map(toHolidayConfig);
}

export async function GET(request: NextRequest) {
  const yearParam = request.nextUrl.searchParams.get("year");
  const parsedYear = yearParam ? Number.parseInt(yearParam, 10) : Number.NaN;
  const year = Number.isFinite(parsedYear) ? parsedYear : undefined;

  try {
    const holidays = await loadHolidays(year);
    return NextResponse.json({ holidays });
  } catch {
    return NextResponse.json(
      { message: "No se pudieron cargar los feriados." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "motivos");

  if (unauthorized) {
    return unauthorized;
  }

  let body: HolidayBody;

  try {
    body = (await request.json()) as HolidayBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const date = parseDateOnly(body.date);
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!date || name.length < 3) {
    return NextResponse.json(
      { message: "Ingresa fecha y nombre válidos." },
      { status: 400 },
    );
  }

  const year =
    typeof body.year === "number" && Number.isFinite(body.year)
      ? body.year
      : Number.parseInt(date.slice(0, 4), 10);
  const scope =
    typeof body.scope === "string" && body.scope.trim()
      ? body.scope.trim()
      : "nacional";
  const businessDaysAdvance = parseBusinessDaysAdvance(body.businessDaysAdvance);
  const isActive = body.isActive === undefined ? true : body.isActive === true;

  try {
    const holiday = await prisma.holiday.create({
      data: {
        date: toDateOnly(date),
        name,
        year,
        scope,
        businessDaysAdvance,
        isActive,
        source: "manual",
      },
    });

    return NextResponse.json(
      { holiday: toHolidayConfig(holiday) },
      { status: 201 },
    );
  } catch {
    return NextResponse.json(
      { message: "Ya existe un feriado para esa fecha." },
      { status: 409 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "motivos");

  if (unauthorized) {
    return unauthorized;
  }

  let body: HolidayBody;

  try {
    body = (await request.json()) as HolidayBody;
  } catch {
    return NextResponse.json(
      { message: "Solicitud inválida." },
      { status: 400 },
    );
  }

  const id = typeof body.id === "string" ? body.id : "";
  const date = parseDateOnly(body.date);
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!id || !date || name.length < 3) {
    return NextResponse.json(
      { message: "Datos de feriado incompletos." },
      { status: 400 },
    );
  }

  const year =
    typeof body.year === "number" && Number.isFinite(body.year)
      ? body.year
      : Number.parseInt(date.slice(0, 4), 10);
  const scope =
    typeof body.scope === "string" && body.scope.trim()
      ? body.scope.trim()
      : "nacional";
  const businessDaysAdvance = parseBusinessDaysAdvance(body.businessDaysAdvance);
  const isActive = body.isActive === true;

  try {
    const holiday = await prisma.holiday.update({
      where: { id },
      data: {
        date: toDateOnly(date),
        name,
        year,
        scope,
        businessDaysAdvance,
        isActive,
      },
    });

    return NextResponse.json({ holiday: toHolidayConfig(holiday) });
  } catch {
    return NextResponse.json(
      { message: "No se pudo actualizar el feriado." },
      { status: 500 },
    );
  }
}
