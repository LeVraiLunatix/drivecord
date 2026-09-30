/**
 * GET /api/v2/me — identify the key: its drive, scopes, expiry and IP allowlist.
 * Works with any valid key, whatever its scopes (handy as a smoke test).
 */
import { BUCKETS, ok, v2Route } from "@/lib/api-v2/http";

export const runtime = "nodejs";

export const GET = v2Route({ scope: null, bucket: BUCKETS.read }, async ({ auth }) => {
  const { apiKey, webhook } = auth;
  return ok({
    drive: { id: webhook.driveId, name: webhook.name },
    key: {
      id: apiKey.id,
      name: apiKey.name,
      prefix: apiKey.keyPrefix,
      scopes: apiKey.scopes,
      expiresAt: apiKey.expiresAt?.toISOString() ?? null,
      ipRestricted: apiKey.allowedIps.length > 0,
      createdAt: apiKey.createdAt.toISOString(),
      lastUsedAt: apiKey.lastUsedAt?.toISOString() ?? null,
    },
  });
});
