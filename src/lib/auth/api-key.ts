/**
 * Personal access tokens for the public REST API (`/api/v1/*`, `/api/v2/*`).
 *
 * Format: `dvc_<32 url-safe chars>`. Only the SHA-256 hash is ever persisted —
 * the raw key is shown to the user exactly once, at creation time, same
 * pattern as the email/recovery codes (see `email-code.ts`).
 */
import crypto from "crypto";
import { isIP } from "net";

const KEY_PREFIX = "dvc_";
/** How many chars of the raw key (including the `dvc_` prefix) are kept for display. */
const PREFIX_DISPLAY_LEN = KEY_PREFIX.length + 8;

/** `delete` (permanent removal) and `share` (public links) are enforced by `/api/v2` only. */
export type ApiScope = "read" | "write" | "delete" | "share";
export const API_SCOPES: ApiScope[] = ["read", "write", "delete", "share"];
/** What a key gets when the creator doesn't pick anything: least privilege. */
export const DEFAULT_API_SCOPES: ApiScope[] = ["read"];

/** Shape of a raw key: prefix + 24 random bytes in base64url (32 chars). */
export const API_KEY_FORMAT = /^dvc_[A-Za-z0-9_-]{32}$/;

export const MAX_ALLOWED_IPS = 10;
export const MAX_EXPIRY_DAYS = 365;

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `${KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, PREFIX_DISPLAY_LEN), hash: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Filter + dedupe a client-supplied scope list, defaulting to read-only. */
export function sanitizeScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return [...DEFAULT_API_SCOPES];
  const scopes = input.filter((s): s is ApiScope => API_SCOPES.includes(s as ApiScope));
  return scopes.length > 0 ? [...new Set(scopes)] : [...DEFAULT_API_SCOPES];
}

/** Validate a client-supplied IP allowlist. Returns null when any entry is invalid. */
export function sanitizeAllowedIps(input: unknown): string[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_ALLOWED_IPS) return null;
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") return null;
    const ip = raw.trim();
    if (!ip) continue;
    if (isIP(ip) === 0) return null;
    out.add(normalizeIp(ip));
  }
  return [...out];
}

/** Turn `expiresInDays` (client input) into a date. `undefined` when absent, `null` when invalid. */
export function expiryFromDays(input: unknown, now = Date.now()): Date | null | undefined {
  if (input === undefined || input === null) return undefined;
  if (typeof input !== "number" || !Number.isInteger(input) || input < 1 || input > MAX_EXPIRY_DAYS) {
    return null;
  }
  return new Date(now + input * 86_400_000);
}

/** Lower-case, and unwrap IPv4-mapped IPv6 (`::ffff:1.2.3.4`) so comparisons are stable. */
export function normalizeIp(ip: string): string {
  const lower = ip.trim().toLowerCase();
  return lower.startsWith("::ffff:") && isIP(lower.slice(7)) === 4 ? lower.slice(7) : lower;
}

export type KeyRestrictionFailure = "expired" | "ip_not_allowed";

/** Check the restrictions that depend on *when/where* a key is used. */
export function checkKeyRestrictions(
  key: { expiresAt: Date | null; allowedIps: string[] },
  ip: string,
  now = Date.now(),
): KeyRestrictionFailure | null {
  if (key.expiresAt && key.expiresAt.getTime() <= now) return "expired";
  if (key.allowedIps.length > 0) {
    const client = normalizeIp(ip);
    if (!key.allowedIps.some((allowed) => normalizeIp(allowed) === client)) return "ip_not_allowed";
  }
  return null;
}
