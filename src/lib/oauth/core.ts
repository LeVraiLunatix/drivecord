/**
 * OAuth 2.1 building blocks (authorization code + PKCE, refresh rotation).
 * Pure functions only — no database, no network — so the rules are unit-tested exhaustively.
 *
 * Token formats (random, opaque; only SHA-256 hashes are stored):
 *   dvc_at_…  access token   (1 h)
 *   dvc_rt_…  refresh token  (90 days, single use, rotated)
 *   dvc_cs_…  client secret  (confidential apps only)
 */
import crypto from "crypto";

export const ACCESS_TTL_SEC = 60 * 60;
export const REFRESH_TTL_SEC = 90 * 24 * 60 * 60;
export const CODE_TTL_SEC = 60;

/** `app_folder:*` only ever reach the app's own folder; `profile:basic` is id + display name. No scope gives a key. */
export const APP_SCOPES = ["app_folder:write", "app_folder:read", "app_folder:delete", "profile:basic"] as const;
export type AppScope = (typeof APP_SCOPES)[number];

export const SCOPE_LABELS_FR: Record<AppScope, string> = {
  "app_folder:write": "Envoyer des fichiers dans son dossier dédié",
  "app_folder:read": "Lister et télécharger (chiffrés) les fichiers de son dossier",
  "app_folder:delete": "Supprimer les fichiers de son dossier",
  "profile:basic": "Connaître ton identifiant et ton nom d'affichage",
};

export type TokenKind = "at" | "rt" | "cs" | "code";
const PREFIX: Record<TokenKind, string> = { at: "dvc_at_", rt: "dvc_rt_", cs: "dvc_cs_", code: "dvc_ac_" };

export function generateToken(kind: TokenKind): { raw: string; hash: string } {
  const raw = `${PREFIX[kind]}${crypto.randomBytes(32).toString("base64url")}`;
  return { raw, hash: hashToken(raw) };
}

export function hashToken(raw: string): string {
  return crypto.createHash("sha256").update(raw).digest("hex");
}

const TOKEN_FORMAT = /^dvc_(at|rt|cs|ac)_[A-Za-z0-9_-]{43}$/;
/** Cheap structural check before any database lookup. */
export function tokenKindOf(raw: string): TokenKind | null {
  const m = TOKEN_FORMAT.exec(raw);
  return m ? ((m[1] === "ac" ? "code" : m[1]) as TokenKind) : null;
}

export function timingSafeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Space-separated scope string → validated, de-duplicated list. `null` when anything is unknown / empty. */
export function parseScopes(input: string | null | undefined): AppScope[] | null {
  if (!input) return null;
  const parts = [...new Set(input.split(/\s+/).filter(Boolean))];
  if (parts.length === 0 || !parts.every((p): p is AppScope => (APP_SCOPES as readonly string[]).includes(p))) return null;
  return parts;
}

export const isSubset = (requested: readonly string[], allowed: readonly string[]) => requested.every((s) => allowed.includes(s));

// ── PKCE ─────────────────────────────────────────────────────────────────────

const VERIFIER_FORMAT = /^[A-Za-z0-9\-._~]{43,128}$/;
const CHALLENGE_FORMAT = /^[A-Za-z0-9_-]{43}$/;

export const isValidCodeChallenge = (c: unknown): c is string => typeof c === "string" && CHALLENGE_FORMAT.test(c);

/** S256 only (plain is not allowed in OAuth 2.1). */
export function verifyPkce(verifier: unknown, challenge: string): boolean {
  if (typeof verifier !== "string" || !VERIFIER_FORMAT.test(verifier)) return false;
  const computed = crypto.createHash("sha256").update(verifier).digest("base64url");
  return timingSafeEqualHex(computed, challenge);
}

// ── Redirect URIs ────────────────────────────────────────────────────────────

/** Exact string match — no prefix, no wildcard, no normalisation games. */
export const redirectUriMatches = (registered: readonly string[], uri: string) => registered.includes(uri);

/** Whether a redirect URI may be REGISTERED: https (or http on loopback), no fragment, no credentials. */
export function validateRedirectUri(uri: string): boolean {
  if (uri.length > 2048) return false;
  let u: URL;
  try {
    u = new URL(uri);
  } catch {
    return false;
  }
  if (u.hash || u.username || u.password) return false;
  const loopback = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (u.protocol === "https:") return true;
  if (u.protocol === "http:") return loopback;
  return false;
}

/** Origins for the iframe SDK / CORS: exact `https://host[:port]` (http only on loopback). */
export function validateOrigin(origin: string): boolean {
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  const loopback = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  return u.origin === origin && (u.protocol === "https:" || (u.protocol === "http:" && loopback));
}

/** Append OAuth response params to a redirect URI (preserving any existing query). */
export function withParams(redirectUri: string, params: Record<string, string | undefined>): string {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v);
  return u.toString();
}

export const APP_ID_FORMAT = /^app_[A-Za-z0-9]{16,32}$/;
export function generateAppId(): string {
  return `app_${crypto.randomBytes(12).toString("base64url").replace(/[-_]/g, "x")}`;
}
