import {
  CHILE_NATIONAL_HOLIDAYS_2026,
  DEFAULT_HOLIDAY_BUSINESS_DAYS_ADVANCE,
} from "@/lib/chile-holidays-2026";
import { toHolidayConfig } from "@/lib/holidays";
import { requireAdminPermission } from "@/lib/admin-api-server";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function toDateOnly(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

export async function POST(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "motivos");

  if (unauthorized) {
    return unauthorized;
  }

  const results = [];

  for (const item of CHILE_NATIONAL_HOLIDAYS_2026) {
    const holiday = await prisma.holiday.upsert({
      where: { date: toDateOnly(item.date) },
      create: {
        date: toDateOnly(item.date),
        name: item.name,
        year: 2026,
        scope: "nacional",
        businessDaysAdvance: DEFAULT_HOLIDAY_BUSINESS_DAYS_ADVANCE,
        isActive: true,
        source: "seed_chile_2026",
      },
      update: {
        name: item.name,
        year: 2026,
        scope: "nacional",
        businessDaysAdvance: DEFAULT_HOLIDAY_BUSINESS_DAYS_ADVANCE,
        isActive: true,
        source: "seed_chile_2026",
      },
    });

    results.push(toHolidayConfig(holiday));
  }

  return NextResponse.json({
    message: `Se cargaron ${results.length} feriados nacionales de Chile 2026.`,
    holidays: results,
  });
}
