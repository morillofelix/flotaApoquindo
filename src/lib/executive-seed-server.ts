import { defaultExecutives } from "@/lib/appointments";
import { prisma } from "@/lib/prisma";

/** Solo siembra la primera vez. No vuelve a crear ejecutivos que el usuario ya eliminó. */
export async function seedExecutivesIfEmpty() {
  const count = await prisma.executive.count();

  if (count > 0) {
    return;
  }

  await prisma.executive.createMany({
    data: defaultExecutives.map((executive) => ({
      name: executive.name,
      email: executive.email,
      isActive: executive.isActive,
      dailyLimitEnabled: executive.dailyLimitEnabled ?? false,
      dailyLimitMax: executive.dailyLimitMax ?? null,
      lunchBreakEnabled: executive.lunchBreakEnabled ?? false,
      lunchBreakStart: executive.lunchBreakStart ?? "",
      lunchBreakEnd: executive.lunchBreakEnd ?? "",
      sortOrder: executive.sortOrder,
    })),
    skipDuplicates: true,
  });
}
