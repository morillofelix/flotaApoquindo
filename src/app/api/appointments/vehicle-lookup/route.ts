import { requireAdminPermission } from "@/lib/admin-api-server";
import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { prisma } from "@/lib/prisma";
import { NextResponse, type NextRequest } from "next/server";

export const dynamic = "force-dynamic";

function resolvePhone(mobilePhone: string, landlinePhone: string) {
  return mobilePhone.trim() || landlinePhone.trim();
}

function resolvePropietarioPersonName(row: {
  firstName: string;
  lastName: string;
  secondLastName: string;
  accountHolder: string;
  fullName: string;
}) {
  const composed = [row.firstName, row.lastName, row.secondLastName]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ");

  if (composed) {
    return composed;
  }

  const accountHolder = row.accountHolder.trim();
  if (accountHolder) {
    return accountHolder;
  }

  return row.fullName.trim();
}

function resolvePropietarioEmail(row: { email: string; titularEmail: string }) {
  return row.email.trim() || row.titularEmail.trim();
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
    prisma.propietario.findFirst({
      where: {
        isActive: true,
        vehicleNumber,
      },
      orderBy: [{ updatedAt: "desc" }],
      select: {
        fullName: true,
        firstName: true,
        lastName: true,
        secondLastName: true,
        accountHolder: true,
        email: true,
        titularEmail: true,
      },
    }),
  ]);

  if (!driverOwner) {
    return NextResponse.json({ result: null });
  }

  const companyName = propietario?.fullName.trim() ?? "";
  const ownerName = propietario
    ? resolvePropietarioPersonName(propietario)
    : "";
  const ownerEmail = propietario ? resolvePropietarioEmail(propietario) : "";

  return NextResponse.json({
    result: {
      vehicleNumber: driverOwner.vehicleNumber,
      fullName: driverOwner.fullName,
      email: driverOwner.email.trim(),
      phone: resolvePhone(driverOwner.mobilePhone, driverOwner.landlinePhone),
      companyName,
      ownerName,
      ownerEmail,
    },
  });
}
