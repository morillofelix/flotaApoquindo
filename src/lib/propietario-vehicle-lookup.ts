import { normalizeVehicleNumber } from "@/lib/driver-owners";
import { prisma } from "@/lib/prisma";

export type PropietarioVehicleMatch = {
  companyName: string;
  ownerName: string;
  ownerEmail: string;
  vehicleNumber: string;
  isActive: boolean;
  status: string;
};

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

function vehicleNumberMatchCandidates(raw: string) {
  const normalized = normalizeVehicleNumber(raw);
  const digits = raw.replace(/\D/g, "");
  const candidates = new Set<string>();

  if (normalized) {
    candidates.add(normalized);
  }

  if (digits) {
    candidates.add(digits);
    candidates.add(digits.replace(/^0+/, "") || digits);
    candidates.add(digits.padStart(3, "0"));
  }

  return [...candidates].filter(Boolean);
}

/**
 * Matches Propietario by móvil even if the record is in revisión / inactive,
 * because contact data is still needed for CC and display in create flows.
 */
export async function findPropietarioByVehicleNumber(
  vehicleNumber: string,
): Promise<PropietarioVehicleMatch | null> {
  const candidates = vehicleNumberMatchCandidates(vehicleNumber);

  if (candidates.length === 0) {
    return null;
  }

  const rows = await prisma.propietario.findMany({
    where: {
      vehicleNumber: { in: candidates },
      status: { not: "desvinculado" },
    },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    take: 10,
    select: {
      vehicleNumber: true,
      fullName: true,
      firstName: true,
      lastName: true,
      secondLastName: true,
      accountHolder: true,
      email: true,
      titularEmail: true,
      isActive: true,
      status: true,
    },
  });

  if (rows.length === 0) {
    return null;
  }

  const preferred =
    rows.find((row) => Boolean(resolvePropietarioEmail(row))) ?? rows[0];

  if (!preferred) {
    return null;
  }

  return {
    companyName: preferred.fullName.trim(),
    ownerName: resolvePropietarioPersonName(preferred),
    ownerEmail: resolvePropietarioEmail(preferred),
    vehicleNumber: preferred.vehicleNumber,
    isActive: preferred.isActive,
    status: preferred.status,
  };
}

export { resolvePropietarioEmail };
