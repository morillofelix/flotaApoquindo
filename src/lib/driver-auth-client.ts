export async function clearDriverSession() {
  await fetch("/api/auth?action=logout", {
    method: "POST",
    credentials: "same-origin",
    cache: "no-store",
  }).catch(() => undefined);
}
