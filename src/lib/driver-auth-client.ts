import type { PublicDriverOwner } from "@/components/DriverAccessLoginScreen";

export async function clearDriverSession() {
  await fetch("/api/auth?action=logout", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  }).catch(() => undefined);
}

export async function restoreDriverSession() {
  try {
    const response = await fetch("/api/auth", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
    });

    if (!response.ok) {
      return { authenticated: false as const };
    }

    return (await response.json()) as
      | { authenticated: false }
      | { authenticated: true; driverOwner: PublicDriverOwner };
  } catch {
    return { authenticated: false as const };
  }
}
