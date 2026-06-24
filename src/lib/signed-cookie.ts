import { createHmac, timingSafeEqual } from "node:crypto";

type SignedEnvelope<T> = {
  payload: T;
  signature: string;
};

export function getSessionSecret() {
  return (
    process.env.SESSION_SECRET?.trim() ||
    process.env.ADMIN_PASSWORD?.trim() ||
    ""
  );
}

export function signCookieValue<T extends object>(
  payload: T,
  secret: string,
): string {
  const signature = createHmac("sha256", secret)
    .update(JSON.stringify(payload))
    .digest("hex");

  return Buffer.from(
    JSON.stringify({ payload, signature } satisfies SignedEnvelope<T>),
  ).toString("base64url");
}

export function verifyCookieValue<T extends object>(
  value: string,
  secret: string,
): T | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as SignedEnvelope<T>;

    if (!parsed?.payload || typeof parsed.signature !== "string") {
      return null;
    }

    const expected = createHmac("sha256", secret)
      .update(JSON.stringify(parsed.payload))
      .digest("hex");

    const provided = Buffer.from(parsed.signature, "hex");
    const expectedBuffer = Buffer.from(expected, "hex");

    if (
      provided.length !== expectedBuffer.length ||
      !timingSafeEqual(provided, expectedBuffer)
    ) {
      return null;
    }

    return parsed.payload;
  } catch {
    return null;
  }
}
