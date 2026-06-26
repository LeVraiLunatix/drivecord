/**
 * Helpers for cross-device login approval.
 *
 * A new device creates a LoginRequest carrying a short 4-digit code (shown on
 * both devices for anti-phishing matching) and a secret pollToken (known only to
 * the requesting device, used to poll status and claim the session).
 */
import crypto from "crypto";

export const LOGIN_REQUEST_TTL_MS = 2 * 60 * 1000; // 2 minutes

export function generateShortCode(): string {
  return crypto.randomInt(0, 10_000).toString().padStart(4, "0");
}

export function generatePollToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

/** Best-effort approximate location from Vercel's geo IP headers. */
export function requestLocation(req: Request): string | null {
  const rawCity = req.headers.get("x-vercel-ip-city");
  const country = req.headers.get("x-vercel-ip-country");
  const city = rawCity ? decodeURIComponent(rawCity) : null;
  if (city && country) return `${city}, ${country}`;
  return country ?? null;
}
