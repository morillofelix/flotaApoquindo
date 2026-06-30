import type { NextRequest } from "next/server";
import { readAdminSession } from "@/lib/driver-auth";

export function getPropietarioNotifyActor(request: NextRequest) {
  const session = readAdminSession(request);

  if (!session) {
    return "Usuario del sistema";
  }

  return session.email ?? session.user;
}
