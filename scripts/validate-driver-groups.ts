/**
 * Validación post-migración de grupos de conductores.
 *
 * Uso (con DATABASE_URL cargada):
 *   npx tsx scripts/validate-driver-groups.ts
 *
 * Comprueba:
 * - Existen DIURNO / NOCTURNO / INTERMEDIO
 * - Categorías A/B/C y G1/G2 por grupo
 * - Conductores con shifts pero sin groupId
 * - Conteos de backfill
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const groups = await prisma.driverGroup.findMany({
    include: { subgroups: true, _count: { select: { drivers: true } } },
    orderBy: { sortOrder: "asc" },
  });

  console.log("=== Grupos ===");
  for (const group of groups) {
    console.log(
      `${group.code} | ${group.name} | active=${group.isActive} | drivers=${group._count.drivers} | subgroups=${group.subgroups.length}`,
    );
  }

  const withoutGroup = await prisma.driverOwner.count({
    where: {
      isConductor: true,
      OR: [{ groupId: null }, { groupId: "" }],
      NOT: { shifts: "" },
    },
  });

  const withGroup = await prisma.driverOwner.count({
    where: { isConductor: true, groupId: { not: null } },
  });

  console.log("\n=== Conductores ===");
  console.log(`Con groupId: ${withGroup}`);
  console.log(`Con turnos y sin groupId: ${withoutGroup}`);

  if (withoutGroup > 0) {
    const samples = await prisma.driverOwner.findMany({
      where: {
        isConductor: true,
        groupId: null,
        NOT: { shifts: "" },
      },
      select: { id: true, vehicleNumber: true, fullName: true, shifts: true },
      take: 20,
    });
    console.log("Muestra sin migrar:", samples);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
