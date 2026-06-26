/**
 * Short-lived, HMAC-signed cookie holding a WebAuthn challenge.
 *
 * httpOnly keeps it away from XSS; the signature (AUTH_SECRET) prevents a client
 * from substituting a challenge of their choosing. Separate cookies for the
 * registration and authentication ceremonies.
 */
import crypto from "crypto";

export const REG_CHALLENGE_COOKIE = "dvc_wa_reg";
export const AUTH_CHALLENGE_COOKIE = "dvc_wa_auth";

function sign(value: string): string {
  return crypto
    .createHmac("sha256", process.env.AUTH_SECRET ?? "")
    .update(value)
    .digest("base64url");
}

/** `challenge.signature` — challenge is base64url so it never contains a dot. */
export function packChallenge(challenge: string): string {
  return `${challenge}.${sign(challenge)}`;
}

export function unpackChallenge(packed: string | undefined | null): string | null {
  if (!packed) return null;
  const idx = packed.lastIndexOf(".");
  if (idx < 0) return null;
  const challenge = packed.slice(0, idx);
  const sig = packed.slice(idx + 1);
  const expected = sign(challenge);
  if (
    sig.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))
  ) {
    return null;
  }
  return challenge;
}

export function challengeCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: 300, // 5 minutes
  };
}
