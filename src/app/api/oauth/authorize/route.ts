/**
 * The consent step of the authorization-code flow, driven by the /oauth/authorize page.
 *
 * GET  → validate the request; returns what the consent screen needs (app, scopes in French, the
 *        user's drives, any existing grant). Invalid client / redirect_uri → 400 `fatal` (never redirect).
 * POST → the user's decision. Approve: bind the app to the chosen drive + app folder, issue a
 *        single-use code. Deny: `access_denied`. Returns `{ redirectUrl }`.
 *
 * Session only (never reachable with an API key), same-origin POST only.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { isResponse, readBody, requireUser } from "@/lib/e2ee-server";
import { SCOPE_LABELS_FR, withParams } from "@/lib/oauth/core";
import { OAuthError, assertAppFolder, issueCode, upsertGrant, validateAuthorizeRequest } from "@/lib/oauth/server";

export const runtime = "nodejs";

type Fatal = OAuthError & { fatal?: boolean; redirectUri?: string; state?: string };

export async function GET(req: NextRequest) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const sp = req.nextUrl.searchParams;
  try {
    const v = await validateAuthorizeRequest({
      client_id: sp.get("client_id"),
      redirect_uri: sp.get("redirect_uri"),
      response_type: sp.get("response_type"),
      code_challenge: sp.get("code_challenge"),
      code_challenge_method: sp.get("code_challenge_method"),
      scope: sp.get("scope"),
      state: sp.get("state"),
    });
    const [drives, grant] = await Promise.all([
      prisma.webhook.findMany({ where: { userId: u.userId }, select: { driveId: true, name: true, e2eeVersion: true }, orderBy: { lastOpenedAt: "desc" } }),
      prisma.appGrant.findFirst({ where: { appId: v.app.id, userId: u.userId, revokedAt: null }, include: { webhook: { select: { driveId: true } } } }),
    ]);
    return NextResponse.json({
      app: { id: v.app.id, name: v.app.name, iconUrl: v.app.iconUrl, homepageUrl: v.app.homepageUrl, verified: v.app.verified },
      scopes: v.scopes.map((s) => ({ scope: s, label: SCOPE_LABELS_FR[s] })),
      drives,
      existingGrant: grant ? { driveId: grant.webhook.driveId, appFolderId: grant.appFolderId } : null,
    });
  } catch (err) {
    if (err instanceof OAuthError) {
      const e = err as Fatal;
      // Anything reportable goes back to the app; the page turns this into a redirect.
      return NextResponse.json(
        { error: err.error, error_description: err.message, fatal: Boolean(e.fatal), ...(e.fatal ? {} : { redirectUrl: withParams(e.redirectUri!, { error: err.error, error_description: err.message, state: e.state }) }) },
        { status: 400 },
      );
    }
    throw err;
  }
}

const bodySchema = z.object({
  client_id: z.string().max(64),
  redirect_uri: z.string().max(2048),
  response_type: z.string(),
  code_challenge: z.string().max(128),
  code_challenge_method: z.string(),
  scope: z.string().max(512),
  state: z.string().max(512).optional(),
  approve: z.boolean(),
  driveId: z.string().max(128).optional(),
  appFolderId: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/).optional(),
});

export async function POST(req: NextRequest) {
  // A consent click must come from OUR page: refuse cross-site form posts outright.
  const origin = req.headers.get("origin");
  if (origin && new URL(origin).host !== req.nextUrl.host) {
    return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  }
  const u = await requireUser();
  if (isResponse(u)) return u;
  const rl = await rateLimit(`oauth:consent:${u.userId}`, 30, 60);
  if (!rl.ok) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429 });

  const b = await readBody(req, bodySchema);
  if (isResponse(b)) return b;

  try {
    const v = await validateAuthorizeRequest(b);
    if (!b.approve) {
      return NextResponse.json({ redirectUrl: withParams(v.redirectUri, { error: "access_denied", error_description: "Refusé par l'utilisateur.", state: v.state }) });
    }
    if (!b.driveId || !b.appFolderId) return NextResponse.json({ error: "Choisis un drive." }, { status: 400 });
    const webhook = await prisma.webhook.findFirst({ where: { driveId: b.driveId, userId: u.userId } });
    if (!webhook) return NextResponse.json({ error: "Drive introuvable." }, { status: 404 });
    if (webhook.e2eeVersion < 1) return NextResponse.json({ error: "Ce drive doit d'abord passer en chiffrement de bout en bout." }, { status: 409 });
    await assertAppFolder(webhook.id, b.appFolderId);

    const grant = await upsertGrant({ appId: v.app.id, userId: u.userId, webhookId: webhook.id, appFolderId: b.appFolderId, scopes: v.scopes });
    const code = await issueCode({ appId: v.app.id, userId: u.userId, grantId: grant.id, redirectUri: v.redirectUri, codeChallenge: v.codeChallenge, scopes: v.scopes });
    return NextResponse.json({ redirectUrl: withParams(v.redirectUri, { code, state: v.state }) });
  } catch (err) {
    if (err instanceof OAuthError) {
      const e = err as Fatal;
      return NextResponse.json({ error: err.error, error_description: err.message, fatal: Boolean(e.fatal) }, { status: 400 });
    }
    throw err;
  }
}
