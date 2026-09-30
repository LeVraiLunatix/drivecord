/**
 * Request pipeline shared by every `/api/v2` route:
 *
 *   key format → key lookup → expiry / IP allowlist → per-key rate limit →
 *   scope check → handler → uniform JSON errors + hardened response headers.
 *
 * Differences from v1, all on purpose:
 *  - no CORS at all: the API is server-to-server (a key embedded in browser
 *    code is a leaked key), so browsers can't call it cross-origin;
 *  - scopes are exact (`delete`, `share` are never implied by `write`);
 *  - failed authentications are throttled per client IP;
 *  - unexpected errors never leak internals (only a request id to quote).
 */
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { API_KEY_FORMAT, checkKeyRestrictions, hashApiKey, type ApiScope } from "@/lib/auth/api-key";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import type { ApiKey, Webhook } from "@/generated/prisma/client";
import { ApiError } from "./errors.ts";
import { MAX_BODY_BYTES, parseJsonObject } from "./validate.ts";

export type RateBucket = { name: string; limit: number };
export const BUCKETS = {
  read: { name: "read", limit: 120 },
  write: { name: "write", limit: 60 },
  delete: { name: "delete", limit: 30 },
  /** Downloads buffer the whole file server-side — keep them scarce. */
  download: { name: "download", limit: 30 },
  share: { name: "share", limit: 30 },
} as const satisfies Record<string, RateBucket>;

const WINDOW_SEC = 60;
/** Wrong-key attempts tolerated per IP per minute before we answer 429. */
const AUTH_FAIL_LIMIT = 30;
/** Only persist `lastUsedAt` at most this often (avoids a DB write per request). */
const LAST_USED_GRANULARITY_MS = 60_000;

export type V2Auth = { apiKey: ApiKey; webhook: Webhook };

export type V2Context<P> = {
  req: NextRequest;
  auth: V2Auth;
  params: P;
  requestId: string;
};

/** `scope: null` = any valid key (used by `/me`). */
type RouteOptions = { scope: ApiScope | null; bucket: RateBucket };

const BASE_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  Vary: "Authorization",
};

function decorate(res: Response, requestId: string, extra?: Record<string, string>): Response {
  for (const [k, v] of Object.entries(BASE_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
  res.headers.set("X-Request-Id", requestId);
  if (extra) for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

/** JSON success response. */
export function ok(body: unknown, init?: { status?: number }): Response {
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function noContent(): Response {
  return new NextResponse(null, { status: 204 });
}

function errorResponse(err: ApiError, requestId: string): Response {
  const res = NextResponse.json(
    { error: { code: err.code, message: err.message, requestId, ...(err.details ?? {}) } },
    { status: err.status },
  );
  return decorate(res, requestId, err.headers);
}

async function authenticate(req: NextRequest): Promise<V2Auth> {
  const ip = getClientIp(req);

  const fail = async (err: ApiError): Promise<never> => {
    // Throttle guessing: every failed attempt burns the IP's budget.
    const r = await rateLimit(`apiv2:authfail:${ip}`, AUTH_FAIL_LIMIT, WINDOW_SEC);
    if (!r.ok) {
      throw new ApiError(429, "rate_limited", "Trop de tentatives d'authentification.", {
        "Retry-After": String(r.retryAfterSec),
      });
    }
    throw err;
  };
  const unauthorized = () =>
    new ApiError(401, "unauthorized", "Clé API invalide ou manquante.", {
      "WWW-Authenticate": 'Bearer realm="drivecord"',
    });

  const header = req.headers.get("authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!API_KEY_FORMAT.test(raw)) return fail(unauthorized());

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash: hashApiKey(raw) },
    include: { webhook: true },
  });
  if (!apiKey) return fail(unauthorized());

  const restriction = checkKeyRestrictions(apiKey, ip);
  if (restriction === "expired") throw new ApiError(401, "key_expired", "Cette clé API a expiré.");
  if (restriction === "ip_not_allowed") {
    throw new ApiError(403, "ip_not_allowed", "Cette clé n'est pas autorisée depuis cette adresse IP.");
  }

  if (!apiKey.lastUsedAt || Date.now() - apiKey.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS) {
    prisma.apiKey
      .update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }

  return { apiKey, webhook: apiKey.webhook };
}

/**
 * Wrap a route handler with the v2 pipeline. The returned function has the
 * `(req, { params })` signature Next.js route handlers expect.
 */
export function v2Route<P extends Record<string, string> = Record<string, never>>(
  opts: RouteOptions,
  handler: (ctx: V2Context<P>) => Promise<Response>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }): Promise<Response> => {
    const requestId = crypto.randomUUID();
    try {
      const auth = await authenticate(req);

      const limited = await rateLimit(
        `apiv2:${opts.bucket.name}:${auth.apiKey.id}`,
        opts.bucket.limit,
        WINDOW_SEC,
      );
      const rlHeaders = {
        "X-RateLimit-Limit": String(opts.bucket.limit),
        "X-RateLimit-Remaining": String(Math.max(0, limited.remaining)),
      };
      if (!limited.ok) {
        throw new ApiError(429, "rate_limited", "Trop de requêtes. Réessaie plus tard.", {
          ...rlHeaders,
          "Retry-After": String(limited.retryAfterSec),
        });
      }

      if (opts.scope && !auth.apiKey.scopes.includes(opts.scope)) {
        throw new ApiError(
          403,
          "insufficient_scope",
          `Cette clé n'a pas la permission \`${opts.scope}\`.`,
          undefined,
          { requiredScope: opts.scope },
        );
      }

      const params = await routeCtx.params;
      const res = await handler({ req, auth, params, requestId });
      return decorate(res, requestId, rlHeaders);
    } catch (err) {
      if (err instanceof ApiError) return errorResponse(err, requestId);
      console.error(`[api-v2] ${requestId}`, err);
      return errorResponse(new ApiError(500, "internal_error", "Erreur interne."), requestId);
    }
  };
}

/** Read a JSON object body with a hard size cap and content-type check. */
export async function readJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") {
    throw new ApiError(415, "unsupported_media_type", "Content-Type doit être application/json.");
  }
  const declared = Number(req.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    throw new ApiError(413, "payload_too_large", `Corps trop volumineux (max ${MAX_BODY_BYTES} octets).`);
  }
  const text = await req.text();
  if (Buffer.byteLength(text) > MAX_BODY_BYTES) {
    throw new ApiError(413, "payload_too_large", `Corps trop volumineux (max ${MAX_BODY_BYTES} octets).`);
  }
  return parseJsonObject(text);
}

/** Like `readJsonBody`, but an entirely absent body is `{}` (for optional-option POSTs). */
export async function readOptionalJsonBody(req: NextRequest): Promise<Record<string, unknown>> {
  const hasBody =
    req.headers.has("content-type") || Number(req.headers.get("content-length") ?? "0") > 0;
  return hasBody ? readJsonBody(req) : {};
}
