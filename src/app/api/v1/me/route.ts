/**
 * GET /api/v1/me — verify an API key and describe what it can do.
 * Handy as a first integration smoke test.
 */
import { effectiveScopes } from "@/lib/auth/api-key";
import { json, preflight, v1Route } from "@/lib/api-v1/pipeline";

export const runtime = "nodejs";

export function OPTIONS() {
  return preflight();
}

export const GET = v1Route({ route: "/api/v1/me", scope: null }, async ({ auth }) =>
  json({
    drive: auth.webhook.name,
    driveId: auth.webhook.driveId,
    scopes: auth.apiKey.scopes,
    effectiveScopes: [...effectiveScopes(auth.apiKey.scopes)],
    expiresAt: auth.apiKey.expiresAt?.toISOString() ?? null,
  }),
);
