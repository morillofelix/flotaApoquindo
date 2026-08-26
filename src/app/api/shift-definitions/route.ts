import { requireAdminPermission } from "@/lib/admin-api-server";
import {
  createShiftDefinition,
  listShiftDefinitions,
  updateShiftDefinition,
  type ShiftDefinitionInput,
  type ShiftDayRuleConfig,
} from "@/lib/shift-definitions";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = Record<string, unknown>;
const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const nullableText = (value: unknown) => text(value) || null;
const bool = (value: unknown, fallback = false) =>
  value === undefined ? fallback : value === true;
const integer = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : fallback;
};

function dayRules(value: unknown): ShiftDayRuleConfig[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => {
    const row = (item ?? {}) as Body;
    return {
      weekday: integer(row.weekday),
      works: bool(row.works, true),
      startTime: text(row.startTime),
      endTime: text(row.endTime),
      durationMinutes: integer(row.durationMinutes),
      defaultStatusCode: text(row.defaultStatusCode),
    };
  });
}

function createInput(body: Body): ShiftDefinitionInput {
  return {
    code: text(body.code),
    name: text(body.name),
    description: text(body.description),
    groupId: nullableText(body.groupId),
    categorySubgroupId: nullableText(body.categorySubgroupId),
    startTime: text(body.startTime),
    endTime: text(body.endTime),
    crossesMidnight: bool(body.crossesMidnight),
    isActive: bool(body.isActive, true),
    color: text(body.color) || "#0b5cab",
    validFrom: nullableText(body.validFrom),
    validTo: nullableText(body.validTo),
    saturdayRule: text(body.saturdayRule) || "default",
    sundayRule: text(body.sundayRule) || "default",
    holidayRule: text(body.holidayRule) || "default",
    cycleLengthDays: integer(body.cycleLengthDays),
    cycleStartDate: nullableText(body.cycleStartDate),
    observation: text(body.observation),
    patternId: nullableText(body.patternId),
    dayRules: dayRules(body.dayRules),
  };
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    return NextResponse.json({
      shifts: await listShiftDefinitions({
        includeInactive: request.nextUrl.searchParams.get("activeOnly") !== "true",
      }),
    });
  } catch (error) {
    console.error("[shift-definitions GET]", error);
    return NextResponse.json({ message: "No se pudieron cargar los turnos." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "conductores");
  if (unauthorized) return unauthorized;
  try {
    const body = (await request.json()) as Body;
    const shift = await createShiftDefinition(createInput(body));
    return NextResponse.json({ shift }, { status: 201 });
  } catch (error) {
    console.error("[shift-definitions POST]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo crear el turno." },
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
    if (!id) return NextResponse.json({ message: "Falta el turno." }, { status: 400 });
    const parsed = createInput(body);
    const input = Object.fromEntries(
      Object.entries(parsed).filter(([key]) => key in body),
    ) as Partial<ShiftDefinitionInput>;
    return NextResponse.json({ shift: await updateShiftDefinition(id, input) });
  } catch (error) {
    console.error("[shift-definitions PATCH]", error);
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "No se pudo actualizar el turno." },
      { status: 400 },
    );
  }
}
