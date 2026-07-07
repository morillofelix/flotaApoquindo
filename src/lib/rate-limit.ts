type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, RateLimitEntry>();

export function checkRateLimit(
  key: string,
  {
    limit = 10,
    windowMs = 15 * 60 * 1000,
  }: {
    limit?: number;
    windowMs?: number;
  } = {},
) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (current.count >= limit) {
    return { allowed: false, retryAfterMs: current.resetAt - now };
  }

  current.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

export function getClientRateLimitKey(
  request: Request,
  scope: string,
  identity = "",
) {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";
  const normalizedIdentity = identity.trim().toLowerCase();

  return `${scope}:${ip}:${normalizedIdentity}`;
}
