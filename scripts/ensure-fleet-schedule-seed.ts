/**
 * Seed idempotente Etapa 2: estados operativos + motivos de bloqueo.
 *
 * Uso:
 *   npx tsx scripts/ensure-fleet-schedule-seed.ts
 */

import { ensureDefaultBlockReasons } from "../src/lib/block-reasons";
import { ensureDefaultOperationalStatuses } from "../src/lib/operational-status";
import { prisma } from "../src/lib/prisma";

async function main() {
  const statuses = await ensureDefaultOperationalStatuses(prisma);
  const reasons = await ensureDefaultBlockReasons(prisma);

  console.log(
    JSON.stringify(
      {
        ok: true,
        operationalStatuses: statuses.map((row) => ({
          code: row.code,
          name: row.name,
          priority: row.priority,
        })),
        blockReasons: reasons.map((row) => ({
          code: row.code,
          name: row.name,
        })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
