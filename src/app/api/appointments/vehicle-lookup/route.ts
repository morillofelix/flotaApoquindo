import { requireAdminPermission } from "@/lib/admin-api-server";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { findPropietarioByVehicleNumber } from "@/lib/propietario-vehicle-lookup";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function resolvePhone(mobilePhone: string, landlinePhone: string) {
  return mobilePhone.trim() || landlinePhone.trim();
}

export async function GET(request: NextRequest) {
  const unauthorized = requireAdminPermission(request, "solicitudes");

  if (unauthorized) {
    return unauthorized;
  }

  const query = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const digits = query.replace(/\D/g, "");

  if (!digits) {
    return NextResponse.json({ result: null });
  }

  const vehicleNumber = normalizeVehicleNumber(digits);

  const [driverOwner, propietario] = await Promise.all([
    prisma.driverOwner.findFirst({
      where: {
        isActive: true,
        isConductor: true,
        vehicleNumber,
      },
      select: {
        vehicleNumber: true,
        fullName: true,
        email: true,
        mobilePhone: true,
        landlinePhone: true,
      },
    }),
    findPropietarioByVehicleNumber(vehicleNumber),
  ]);

  if (!driverOwner) {
    return NextResponse.json({ result: null });
  }

  return NextResponse.json({
    result: {
      vehicleNumber: driverOwner.vehicleNumber,
      fullName: driverOwner.fullName,
      email: driverOwner.email.trim(),
      phone: resolvePhone(driverOwner.mobilePhone, driverOwner.landlinePhone),
      companyName: propietario?.companyName ?? "",
      ownerName: propietario?.ownerName ?? "",
      ownerEmail: propietario?.ownerEmail ?? "",
    },
  });
}
