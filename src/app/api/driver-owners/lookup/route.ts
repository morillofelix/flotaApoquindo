import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function resolvePhone(mobilePhone: string, landlinePhone: string) {
  return mobilePhone.trim() || landlinePhone.trim();
}

function toLookupResult(driverOwner: {
  vehicleNumber: string;
  fullName: string;
  email: string;
  mobilePhone: string;
  landlinePhone: string;
}) {
  return {
    vehicleNumber: driverOwner.vehicleNumber,
    fullName: driverOwner.fullName,
    email: driverOwner.email.trim(),
    phone: resolvePhone(driverOwner.mobilePhone, driverOwner.landlinePhone),
  };
}

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const exact = request.nextUrl.searchParams.get("exact") === "true";
  const digits = query.replace(/\D/g, "");

  if (!digits) {
    return NextResponse.json({ results: [] });
  }

  const baseWhere = {
    isActive: true,
    isConductor: true,
  };

  if (exact) {
    const driverOwner = await prisma.driverOwner.findFirst({
      where: {
        ...baseWhere,
        vehicleNumber: normalizeVehicleNumber(digits),
      },
      select: {
        vehicleNumber: true,
        fullName: true,
        email: true,
        mobilePhone: true,
        landlinePhone: true,
      },
    });

    return NextResponse.json({
      results: driverOwner ? [toLookupResult(driverOwner)] : [],
    });
  }

  const driverOwners = await prisma.driverOwner.findMany({
    where: {
      ...baseWhere,
      vehicleNumber: { contains: digits },
    },
    orderBy: { vehicleNumber: "asc" },
    take: 5,
    select: {
      vehicleNumber: true,
      fullName: true,
      email: true,
      mobilePhone: true,
      landlinePhone: true,
    },
  });

  return NextResponse.json({
    results: driverOwners.map(toLookupResult),
  });
}
