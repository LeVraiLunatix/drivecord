/**
 * Personal access tokens for the public REST API (`/api/v1/*`).
 *
 * Format: `dvc_<32 url-safe chars>`. Only the SHA-256 hash is ever persisted —
 * the raw key is shown to the user exactly once, at creation time, same
 * pattern as the email/recovery codes (see `email-code.ts`).
 */
import crypto from "crypto";

const KEY_PREFIX = "dvc_";
/** How many chars of the raw key (including the `dvc_` prefix) are kept for display. */
const PREFIX_DISPLAY_LEN = KEY_PREFIX.length + 8;

export type ApiScope = "read" | "write";
export const API_SCOPES: ApiScope[] = ["read", "write"];

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const raw = `${KEY_PREFIX}${crypto.randomBytes(24).toString("base64url")}`;
  return { raw, prefix: raw.slice(0, PREFIX_DISPLAY_LEN), hash: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

/** Filter + dedupe a client-supplied scope list, defaulting to full access. */
export function sanitizeScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return [...API_SCOPES];
  const scopes = input.filter((s): s is ApiScope => API_SCOPES.includes(s as ApiScope));
  return scopes.length > 0 ? [...new Set(scopes)] : [...API_SCOPES];
}
