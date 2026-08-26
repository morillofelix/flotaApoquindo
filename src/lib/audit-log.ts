import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type DbClient = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type AuditLogInput = {
  module: string;
  action: string;
  entityType: string;
  entityId?: string;
  previousValue?: unknown;
  newValue?: unknown;
  reason?: string;
  origin?: "manual" | "automatic";
  userEmail?: string;
};

function serializeAuditValue(value: unknown) {
  if (value === undefined || value === null) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export async function writeAuditLog(
  input: AuditLogInput,
  client: DbClient = prisma,
) {
  return client.auditLog.create({
    data: {
      module: input.module.trim(),
      action: input.action.trim(),
      entityType: input.entityType.trim(),
      entityId: input.entityId?.trim() || "",
      previousValue: serializeAuditValue(input.previousValue),
      newValue: serializeAuditValue(input.newValue),
      reason: input.reason?.trim() || "",
      origin: input.origin ?? "manual",
      userEmail: input.userEmail?.trim().toLowerCase() || "",
    },
  });
}
