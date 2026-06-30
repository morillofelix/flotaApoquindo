import { readAdminSession } from "@/lib/driver-auth";
import { NextResponse, type NextRequest } from "next/server";

export const adminFetchInit: RequestInit = {
  credentials: "include",
};

export function requireAdminSession(request: NextRequest) {
  if (!readAdminSession(request)) {
    return NextResponse.json({ message: "No autorizado." }, { status: 401 });
  }

  return null;
}

export function sanitizeServerErrorMessage(error: unknown, fallback: string) {
  if (process.env.NODE_ENV === "production") {
    return fallback;
  }

  return error instanceof Error ? error.message : fallback;
}
