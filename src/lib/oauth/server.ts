/**
 * OAuth 2.1 server logic (database side). Rules live in `core.ts`.
 *
 * Security properties enforced here:
 *  - PKCE (S256) mandatory for every client, public or confidential;
 *  - authorization codes are single-use (60 s); replaying one revokes every token it produced;
 *  - redirect URIs match exactly, and must equal the one used at /authorize;
 *  - refresh tokens rotate; replaying a used one revokes the whole token family;
 *  - revoking a grant (or the app) kills all its tokens immediately — token lookup checks both.
 */
import { prisma } from "@/lib/prisma";
import {
  ACCESS_TTL_SEC,
  CODE_TTL_SEC,
  REFRESH_TTL_SEC,
  generateToken,
  hashToken,
  isValidCodeChallenge,
  parseScopes,
  redirectUriMatches,
  timingSafeEqualHex,
  tokenKindOf,
  verifyPkce,
  isSubset,
  type AppScope,
} from "./core";

export class OAuthError extends Error {
  readonly error: string;
  readonly status: number;
  constructor(error: string, description: string, status = 400) {
    super(description);
    this.name = "OAuthError";
    this.error = error;
    this.status = status;
  }
}

export async function findApp(clientId: string) {
  if (!/^app_[A-Za-z0-9]{16,32}$/.test(clientId)) return null;
  return prisma.app.findFirst({ where: { id: clientId, revokedAt: null } });
}

/** Confidential clients must present their secret; public ones must not be asked for one. */
export function authenticateClient(app: { clientSecretHash: string | null }, secret: string | null | undefined): void {
  if (!app.clientSecretHash) return;
  if (!secret || tokenKindOf(secret) !== "cs" || !timingSafeEqualHex(hashToken(secret), app.clientSecretHash)) {
    throw new OAuthError("invalid_client", "Authentification du client échouée.", 401);
  }
}

// ── /authorize ───────────────────────────────────────────────────────────────

export type AuthorizeParams = {
  client_id?: string | null;
  redirect_uri?: string | null;
  response_type?: string | null;
  code_challenge?: string | null;
  code_challenge_method?: string | null;
  scope?: string | null;
  state?: string | null;
};

/**
 * Validate an authorization request. Errors about `client_id` / `redirect_uri` must NEVER redirect
 * (the URI can't be trusted yet): they're thrown as `fatal`. Everything else is reportable to the app.
 */
export async function validateAuthorizeRequest(p: AuthorizeParams) {
  const app = p.client_id ? await findApp(p.client_id) : null;
  if (!app) throw Object.assign(new OAuthError("invalid_client", "Application inconnue ou désactivée."), { fatal: true });
  if (!p.redirect_uri || !redirectUriMatches(app.redirectUris, p.redirect_uri)) {
    throw Object.assign(new OAuthError("invalid_request", "redirect_uri non enregistrée pour cette application."), { fatal: true });
  }
  const redirectUri = p.redirect_uri;
  const fail = (error: string, description: string) =>
    Object.assign(new OAuthError(error, description), { redirectUri, state: p.state ?? undefined });

  if (p.response_type !== "code") throw fail("unsupported_response_type", "Seul `response_type=code` est supporté.");
  if (!isValidCodeChallenge(p.code_challenge) || p.code_challenge_method !== "S256") {
    throw fail("invalid_request", "PKCE obligatoire : `code_challenge` (S256).");
  }
  const scopes = parseScopes(p.scope);
  if (!scopes) throw fail("invalid_scope", "Scopes invalides ou manquants.");
  if (p.state && p.state.length > 512) throw fail("invalid_request", "`state` trop long.");
  return { app, redirectUri, scopes, state: p.state ?? undefined, codeChallenge: p.code_challenge };
}

/** The app folder must be a live folder of this very drive (its name is encrypted; only the id is checked). */
export async function assertAppFolder(webhookId: string, folderId: string) {
  const folder = await prisma.driveFolder.findFirst({ where: { id: folderId, webhookId }, select: { trashed: true } });
  if (!folder || folder.trashed) throw new OAuthError("invalid_request", "Dossier de l'application introuvable.");
}

export async function upsertGrant(input: { appId: string; userId: string; webhookId: string; appFolderId: string; scopes: AppScope[] }) {
  const data = { webhookId: input.webhookId, appFolderId: input.appFolderId, scopes: input.scopes, revokedAt: null };
  return prisma.appGrant.upsert({
    where: { appId_userId: { appId: input.appId, userId: input.userId } },
    create: { appId: input.appId, userId: input.userId, ...data },
    update: data,
  });
}

export async function issueCode(input: {
  appId: string;
  userId: string;
  grantId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
}): Promise<string> {
  const { raw, hash } = generateToken("code");
  await prisma.oAuthCode.create({
    data: { codeHash: hash, ...input, expiresAt: new Date(Date.now() + CODE_TTL_SEC * 1000) },
  });
  return raw;
}

// ── /token ───────────────────────────────────────────────────────────────────

async function issueTokens(grant: { id: string; appId: string; userId: string }, familyId: string, scopes: string[]) {
  const at = generateToken("at");
  const rt = generateToken("rt");
  const now = Date.now();
  await prisma.oAuthToken.create({
    data: {
      grantId: grant.id,
      appId: grant.appId,
      userId: grant.userId,
      familyId,
      accessTokenHash: at.hash,
      accessExpiresAt: new Date(now + ACCESS_TTL_SEC * 1000),
      refreshTokenHash: rt.hash,
      refreshExpiresAt: new Date(now + REFRESH_TTL_SEC * 1000),
    },
  });
  return { access_token: at.raw, token_type: "Bearer", expires_in: ACCESS_TTL_SEC, refresh_token: rt.raw, scope: scopes.join(" ") };
}

export async function revokeFamily(familyId: string) {
  await prisma.oAuthToken.updateMany({ where: { familyId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function exchangeCode(input: {
  app: { id: string; clientSecretHash: string | null };
  clientSecret?: string | null;
  code: string | null;
  redirectUri: string | null;
  codeVerifier: string | null;
}) {
  authenticateClient(input.app, input.clientSecret);
  const invalid = () => new OAuthError("invalid_grant", "Code d'autorisation invalide, expiré ou déjà utilisé.");
  if (!input.code || tokenKindOf(input.code) !== "code") throw invalid();

  const codeHash = hashToken(input.code);
  const row = await prisma.oAuthCode.findUnique({ where: { codeHash } });
  if (!row || row.appId !== input.app.id) throw invalid();

  if (row.usedAt) {
    // Replay: assume the code leaked — kill everything it produced.
    await revokeFamily(codeHash);
    throw invalid();
  }
  if (row.expiresAt.getTime() <= Date.now()) throw invalid();
  if (!input.redirectUri || input.redirectUri !== row.redirectUri) throw invalid();
  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) throw invalid();

  // Atomic claim: two racing exchanges can't both succeed.
  const claimed = await prisma.oAuthCode.updateMany({ where: { codeHash, usedAt: null }, data: { usedAt: new Date() } });
  if (claimed.count !== 1) {
    await revokeFamily(codeHash);
    throw invalid();
  }

  const grant = await prisma.appGrant.findFirst({ where: { id: row.grantId, revokedAt: null, app: { revokedAt: null } } });
  if (!grant) throw invalid();
  // The grant may have narrowed since /authorize; never issue more than it holds now.
  const scopes = row.scopes.filter((s) => grant.scopes.includes(s));
  return issueTokens(grant, codeHash, scopes);
}

export async function refreshTokens(input: {
  app: { id: string; clientSecretHash: string | null };
  clientSecret?: string | null;
  refreshToken: string | null;
}) {
  authenticateClient(input.app, input.clientSecret);
  const invalid = () => new OAuthError("invalid_grant", "Jeton de rafraîchissement invalide, expiré ou révoqué.");
  if (!input.refreshToken || tokenKindOf(input.refreshToken) !== "rt") throw invalid();

  const row = await prisma.oAuthToken.findUnique({
    where: { refreshTokenHash: hashToken(input.refreshToken) },
    include: { grant: { include: { app: true } } },
  });
  if (!row || row.appId !== input.app.id) throw invalid();

  if (row.refreshUsedAt) {
    // A rotated-out refresh token came back: the family is compromised (theft or a buggy client).
    await revokeFamily(row.familyId);
    throw invalid();
  }
  if (row.revokedAt || row.refreshExpiresAt.getTime() <= Date.now()) throw invalid();
  if (row.grant.revokedAt || row.grant.app.revokedAt) throw invalid();

  const claimed = await prisma.oAuthToken.updateMany({
    where: { id: row.id, refreshUsedAt: null, revokedAt: null },
    data: { refreshUsedAt: new Date(), accessExpiresAt: new Date() },
  });
  if (claimed.count !== 1) {
    await revokeFamily(row.familyId);
    throw invalid();
  }
  return issueTokens(row.grant, row.familyId, row.grant.scopes);
}

/** RFC 7009: revoking an unknown token is not an error. */
export async function revokeByToken(app: { id: string; clientSecretHash: string | null }, clientSecret: string | null | undefined, raw: string | null) {
  authenticateClient(app, clientSecret);
  if (!raw) return;
  const kind = tokenKindOf(raw);
  if (kind !== "at" && kind !== "rt") return;
  const row = await prisma.oAuthToken.findUnique({
    where: kind === "at" ? { accessTokenHash: hashToken(raw) } : { refreshTokenHash: hashToken(raw) },
  });
  if (row && row.appId === app.id) await revokeFamily(row.familyId);
}

export async function revokeGrant(grantId: string, userId: string): Promise<boolean> {
  const { count } = await prisma.appGrant.updateMany({ where: { id: grantId, userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count === 1) await prisma.oAuthToken.updateMany({ where: { grantId, revokedAt: null }, data: { revokedAt: new Date() } });
  return count === 1;
}

// ── Resource server side ─────────────────────────────────────────────────────

export type AppPrincipal = {
  kind: "app";
  grantId: string;
  appId: string;
  userId: string;
  webhookId: string;
  appFolderId: string;
  scopes: string[];
  tokenId: string;
};

/** Resolve a `dvc_at_…` bearer to its grant. Null for anything not currently valid. */
export async function authenticateAppToken(raw: string): Promise<AppPrincipal | null> {
  if (tokenKindOf(raw) !== "at") return null;
  const row = await prisma.oAuthToken.findUnique({
    where: { accessTokenHash: hashToken(raw) },
    include: { grant: { include: { app: { select: { revokedAt: true } } } } },
  });
  if (!row || row.revokedAt || row.accessExpiresAt.getTime() <= Date.now()) return null;
  if (row.grant.revokedAt || row.grant.app.revokedAt) return null;
  return {
    kind: "app",
    grantId: row.grantId,
    appId: row.appId,
    userId: row.userId,
    webhookId: row.grant.webhookId,
    appFolderId: row.grant.appFolderId,
    scopes: row.grant.scopes,
    tokenId: row.id,
  };
}

export { isSubset };
