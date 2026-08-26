import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  createShiftPattern,
  listShiftPatterns,
  updateShiftPattern,
  type ShiftPatternDayConfig,
  type ShiftPatternInput,
} from "@/lib/shift-patterns";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const integer = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};
function days(value: unknown): ShiftPatternDayConfig[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item ?? {}) as Body;
    return {
      dayOffset: integer(row.dayOffset),
      statusCode: text(row.statusCode),
      startTime: text(row.startTime),
      endTime: text(row.endTime),
    };
  });
}
function input(body: Body): ShiftPatternInput {
  return {
    code: text(body.code),
    name: text(body.name),
    description: text(body.description),
    cycleLengthDays: integer(body.cycleLengthDays, 7),
    baseDate: text(body.baseDate) || null,
    holidayApplication: text(body.holidayApplication) || "default",
    weekendApplication: text(body.weekendApplication) || "default",
    isActive: body.isActive === undefined ? true : body.isActive === true,
    days: days(body.days),
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json({
      patterns: await listShiftPatterns({
        includeInactive: request.nextUrl.searchParams.get("activeOnly") !== "true",
      }),
    });
  } catch (error) {
    console.error("[shift-patterns GET]", error);
    return NextResponse.json({ message: "No se pudieron cargar los patrones." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const pattern = await createShiftPattern(input((await request.json()) as Body));
    return NextResponse.json({ pattern }, { status: 201 });
  } catch (error) {
    console.error("[shift-patterns POST]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo crear el patrón." },
      { status: 400 },
    );
  }
}

export async function PATCH(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Body;
    const id = text(body.id);
    if (!id) return NextResponse.json({ message: "Falta el patrón." }, { status: 400 });
    const parsed = input(body);
    const changes = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => key in body),
    ) as Partial<ShiftPatternInput>;
    return NextResponse.json({ pattern: await updateShiftPattern(id, changes) });
  } catch (error) {
    console.error("[shift-patterns PATCH]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo actualizar el patrón." },
      { status: 400 },
    );
  }
}
