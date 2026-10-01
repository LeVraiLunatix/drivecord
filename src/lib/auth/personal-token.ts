/** Personal access tokens for API v2 (`dvc_pat_…`): the owner's own drive, from their own server. */
import { generateToken, hashToken } from "@/lib/oauth/core";
import { MAX_ALLOWED_ORIGINS, sanitizeAllowedOrigins } from "./api-key";

export const PAT_SCOPES = ["drive:read", "drive:write", "drive:delete", "drive:share"] as const;
export type PatScope = (typeof PAT_SCOPES)[number];
export const DEFAULT_PAT_SCOPES: PatScope[] = ["drive:read"];

export function generatePat() {
  const { raw, hash } = generateToken("pat");
  return { raw, hash, prefix: raw.slice(0, "dvc_pat_".length + 6) };
}

export const hashPat = hashToken;

export function sanitizePatScopes(input: unknown): PatScope[] {
  if (!Array.isArray(input)) return [...DEFAULT_PAT_SCOPES];
  const ok = [...new Set(input.filter((s): s is PatScope => (PAT_SCOPES as readonly string[]).includes(s as string)))];
  return ok.length ? ok : [...DEFAULT_PAT_SCOPES];
}

export { MAX_ALLOWED_ORIGINS, sanitizeAllowedOrigins };
