/**
 * Who is calling API v2: an OAuth app token (`dvc_at_…`, confined to its app folder) or a personal
 * access token (`dvc_pat_…`, the owner's own drive). Every capability check goes through `can`.
 */
import { prisma } from "@/lib/prisma";
import { hashToken, tokenKindOf } from "@/lib/oauth/core";
import { authenticateAppToken, type AppPrincipal } from "@/lib/oauth/server";

export type PatPrincipal = {
  kind: "pat";
  tokenId: string;
  userId: string;
  webhookId: string;
  scopes: string[];
  allowedOrigins: string[];
};
export type Principal = AppPrincipal | PatPrincipal;

/** What a route needs. `share` and `changes` are owner-only: an app can never hand out links or read the whole journal. */
export type Capability = "any" | "read" | "write" | "delete" | "share" | "owner";

const APP_SCOPE: Record<"read" | "write" | "delete", string> = {
  read: "app_folder:read",
  write: "app_folder:write",
  delete: "app_folder:delete",
};
const PAT_SCOPE: Record<"read" | "write" | "delete" | "share", string> = {
  read: "drive:read",
  write: "drive:write",
  delete: "drive:delete",
  share: "drive:share",
};

export function can(p: Principal, cap: Capability): boolean {
  if (cap === "any") return true;
  if (p.kind === "app") return cap !== "share" && cap !== "owner" && p.scopes.includes(APP_SCOPE[cap]);
  return cap === "owner" || p.scopes.includes(PAT_SCOPE[cap]);
}

/** Stable id used for rate limits, upload-session ownership and the audit log. */
export const principalId = (p: Principal) => (p.kind === "app" ? `app:${p.grantId}` : `pat:${p.tokenId}`);

export type AuthFailure = "unauthorized" | "token_expired";

export async function authenticatePrincipal(raw: string): Promise<Principal | AuthFailure> {
  const kind = tokenKindOf(raw);
  if (kind === "at") return (await authenticateAppToken(raw)) ?? "unauthorized";
  if (kind !== "pat") return "unauthorized";

  const row = await prisma.personalToken.findUnique({ where: { keyHash: hashToken(raw) } });
  if (!row || row.revokedAt) return "unauthorized";
  if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) return "token_expired";
  if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > 60_000) {
    prisma.personalToken.update({ where: { id: row.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { kind: "pat", tokenId: row.id, userId: row.userId, webhookId: row.webhookId, scopes: row.scopes, allowedOrigins: row.allowedOrigins };
}
