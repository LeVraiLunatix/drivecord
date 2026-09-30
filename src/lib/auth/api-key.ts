/**
 * Personal access tokens for the public REST API (`/api/v1/*`).
 *
 * Formats (only the SHA-256 hash is ever persisted — the raw key is shown once):
 *  - current: `dvc_<43 url-safe chars = 256 bits>_<crc32 as 8 hex>`. The trailing
 *    CRC32 lets secret scanners (GitHub) and our own API reject typos or
 *    truncated keys without a database lookup.
 *  - legacy : `dvc_<32 url-safe chars>` — still accepted.
 */
import crypto from "crypto";
import { isIP } from "net";

const KEY_PREFIX = "dvc_";
/** How many chars of the raw key (including the `dvc_` prefix) are kept for display. */
const PREFIX_DISPLAY_LEN = KEY_PREFIX.length + 8;

// ── Scopes ───────────────────────────────────────────────────────────────────

export type ApiScope =
  | "files:read"
  | "files:write"
  | "files:delete"
  | "public:manage"
  | "folders:write";
export const API_SCOPES: ApiScope[] = [
  "files:read",
  "files:write",
  "files:delete",
  "public:manage",
  "folders:write",
];
/** Scopes stored on keys created before the fine-grained ones existed. */
export type LegacyScope = "read" | "write";
const LEGACY_EXPANSION: Record<LegacyScope, ApiScope[]> = {
  read: ["files:read"],
  write: ["files:write", "files:delete", "folders:write", "public:manage"],
};
/** What a key gets when the creator doesn't pick anything: least privilege. */
export const DEFAULT_API_SCOPES: ApiScope[] = ["files:read"];

/** Stored scopes (new and/or legacy) → the concrete set of capabilities. */
export function effectiveScopes(stored: readonly string[]): Set<ApiScope> {
  const out = new Set<ApiScope>();
  for (const s of stored) {
    if ((API_SCOPES as string[]).includes(s)) out.add(s as ApiScope);
    else if (s in LEGACY_EXPANSION) for (const e of LEGACY_EXPANSION[s as LegacyScope]) out.add(e);
  }
  return out;
}

export function keyHasScope(key: { scopes: readonly string[] }, scope: ApiScope): boolean {
  return effectiveScopes(key.scopes).has(scope);
}

/** Filter + dedupe a client-supplied scope list (new scopes only), defaulting to read-only. */
export function sanitizeScopes(input: unknown): ApiScope[] {
  if (!Array.isArray(input)) return [...DEFAULT_API_SCOPES];
  const scopes = input.filter((s): s is ApiScope => API_SCOPES.includes(s as ApiScope));
  return scopes.length > 0 ? [...new Set(scopes)] : [...DEFAULT_API_SCOPES];
}

// ── Key format ───────────────────────────────────────────────────────────────

const CURRENT_FORMAT = /^dvc_([A-Za-z0-9_-]{43})_([0-9a-f]{8})$/;
const LEGACY_FORMAT = /^dvc_[A-Za-z0-9_-]{32}$/;

let crcTable: Uint32Array | undefined;
/** CRC-32 (IEEE 802.3), as used by zlib/PNG/GitHub token checksums. */
export function crc32(input: string): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of Buffer.from(input, "utf8")) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const crcHex = (random: string) => crc32(random).toString(16).padStart(8, "0");

/** Cheap structural check (format + checksum) — run BEFORE touching the database. */
export function isWellFormedApiKey(raw: string): boolean {
  if (LEGACY_FORMAT.test(raw)) return true;
  const m = CURRENT_FORMAT.exec(raw);
  return m !== null && crcHex(m[1]!) === m[2];
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const random = crypto.randomBytes(32).toString("base64url"); // 43 chars, 256 bits
  const raw = `${KEY_PREFIX}${random}_${crcHex(random)}`;
  return { raw, prefix: raw.slice(0, PREFIX_DISPLAY_LEN), hash: hashApiKey(raw) };
}

export function hashApiKey(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

// ── Restrictions: expiry, revocation, IP, origin ─────────────────────────────

export const MAX_ALLOWED_IPS = 10;
export const MAX_ALLOWED_ORIGINS = 10;
export const MAX_EXPIRY_DAYS = 365;

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

/** Exact web origins (`https://site.tld[:port]`, no path). Null when any entry is invalid. */
export function sanitizeAllowedOrigins(input: unknown): string[] | null {
  if (input === undefined || input === null) return [];
  if (!Array.isArray(input) || input.length > MAX_ALLOWED_ORIGINS) return null;
  const out = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== "string") return null;
    const v = raw.trim();
    if (!v) continue;
    let u: URL;
    try {
      u = new URL(v);
    } catch {
      return null;
    }
    const localhost = u.hostname === "localhost" || u.hostname === "127.0.0.1";
    if (u.protocol !== "https:" && !(u.protocol === "http:" && localhost)) return null;
    if (u.origin !== v.replace(/\/$/, "") || u.username || u.password) return null;
    out.add(u.origin);
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

export type KeyRestrictionFailure = "revoked" | "expired" | "ip_not_allowed" | "origin_not_allowed";

/** Check the restrictions that depend on *when / where / from whom* a key is used. */
export function checkKeyRestrictions(
  key: {
    expiresAt: Date | null;
    revokedAt: Date | null;
    allowedIps: string[];
    allowedOrigins: string[];
  },
  ctx: { ip: string; origin: string | null },
  now = Date.now(),
): KeyRestrictionFailure | null {
  if (key.revokedAt) return "revoked";
  if (key.expiresAt && key.expiresAt.getTime() <= now) return "expired";
  if (key.allowedIps.length > 0) {
    const client = normalizeIp(ctx.ip);
    if (!key.allowedIps.some((allowed) => normalizeIp(allowed) === client)) return "ip_not_allowed";
  }
  // `Origin` is only sent by browsers: server-to-server calls carry none and pass.
  if (ctx.origin !== null && key.allowedOrigins.length > 0 && !key.allowedOrigins.includes(ctx.origin)) {
    return "origin_not_allowed";
  }
  return null;
}
