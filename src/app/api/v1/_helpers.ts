/**
 * Shared helpers for the public REST API (`/api/v1/*`).
 *
 * Unlike `/api/drive/*` (session-cookie auth, same-origin only), these routes
 * authenticate with a Bearer API key and are meant to be called cross-origin
 * from a third-party site's own server or browser code.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashApiKey, type ApiScope } from "@/lib/auth/api-key";
import { rateLimit } from "@/lib/rate-limit";
import type { ApiKey, Webhook } from "@/generated/prisma/client";

// ── CORS ─────────────────────────────────────────────────────────────────────

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

export function corsJson(body: unknown, init?: ResponseInit): NextResponse {
  return NextResponse.json(body, {
    ...init,
    headers: { ...CORS_HEADERS, ...(init?.headers as Record<string, string> | undefined) },
  });
}

export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export type ApiAuth = { apiKey: ApiKey; webhook: Webhook };

/** Resolve the `Authorization: Bearer dvc_...` header to its API key + drive. */
export async function authenticateApiKey(req: Request): Promise<ApiAuth | null> {
  const header = req.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const raw = header.slice("Bearer ".length).trim();
  if (!raw) return null;

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    include: { webhook: true },
  });
  if (!apiKey) return null;

  // Best-effort — don't block the request on this write.
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return { apiKey, webhook: apiKey.webhook };
}

export function hasScope(apiKey: ApiKey, scope: ApiScope): boolean {
  return apiKey.scopes.includes(scope);
}

/** 60 requests/minute per key — generous for a small site integration, cheap to enforce. */
export async function checkRateLimit(apiKey: ApiKey): Promise<NextResponse | null> {
  const result = await rateLimit(`apikey:${apiKey.id}`, 60, 60);
  if (result.ok) return null;
  return corsJson(
    { error: "Trop de requêtes. Réessaie plus tard." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSec) } },
  );
}
