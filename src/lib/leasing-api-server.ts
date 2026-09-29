import { requireAdminPermission } from "@/lib/admin-api-server";
import { toLeasingErrorResponseMessage } from "@/lib/leasing-server";
import { NextResponse, type NextRequest } from "next/server";

export function requireLeasingAccess(
  request: NextRequest,
  extra?: "leasingCobros" | "leasingAdmin",
) {
  return (
    requireAdminPermission(request, "leasing") ??
    (extra ? requireAdminPermission(request, extra) : null)
  );
}

export function leasingErrorResponse(error: unknown, fallback: string) {
  const { message, status } = toLeasingErrorResponseMessage(error, fallback);
  return NextResponse.json({ message }, { status });
}

export async function readLeasingJsonBody(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
