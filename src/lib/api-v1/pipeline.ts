/**
 * Request pipeline shared by every `/api/v1` route.
 *
 *   key format+checksum → brute-force throttle (per IP) → key lookup →
 *   revoked / expired / IP / origin checks → per-key + per-user rate limits →
 *   scope → handler → CORS (exact origin), RateLimit-* headers, audit log.
 *
 * Errors keep v1's historical shape `{ error: "<message>" }` so existing
 * clients (the Windows app) keep working.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkKeyRestrictions, hashApiKey, isWellFormedApiKey, keyHasScope, type ApiScope } from "@/lib/auth/api-key";
import { getClientIp, rateLimit, rateLimitHeaders, type RateLimitResult } from "@/lib/rate-limit";
import type { ApiKey, Webhook } from "@/generated/prisma/client";
import { recordAudit } from "./audit";
import { UploadError } from "@/lib/upload-session-core";
import { HttpError } from "./errors";

export type V1Auth = { apiKey: ApiKey; webhook: Webhook };
export type V1Context<P> = { req: NextRequest; auth: V1Auth; params: P };

export type Bucket = { name: string; limit: number };
export const BUCKETS = {
  default: { name: "default", limit: 60 },
  /** A large file needs one call per chunk; Discord's own pacing is the real ceiling. */
  chunks: { name: "chunks", limit: 300 },
} as const satisfies Record<string, Bucket>;

const WINDOW_SEC = 60;
/** All of a user's keys together. */
const USER_LIMIT = 600;
/** Wrong / malformed key attempts tolerated per IP per minute. */
const AUTH_FAIL_LIMIT = 30;
const LAST_USED_GRANULARITY_MS = 60_000;

// ── CORS ─────────────────────────────────────────────────────────────────────

const PREFLIGHT_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Max-Age": "86400",
};

/** Shared `OPTIONS` handler. Preflights carry no credentials, so they can't be per-key. */
export function preflight(): NextResponse {
  return new NextResponse(null, { status: 204, headers: PREFLIGHT_HEADERS });
}

/**
 * Only browsers send `Origin`. A key with an origin allowlist gets that exact
 * origin echoed back (the pipeline already refused any other one); a key
 * without gets `*` as before. Server-to-server calls get no CORS headers.
 */
function corsHeaders(origin: string | null, key: Pick<ApiKey, "allowedOrigins"> | null): Record<string, string> {
  if (origin === null) return {};
  if (key && key.allowedOrigins.length > 0) return { "Access-Control-Allow-Origin": origin, Vary: "Origin" };
  return { "Access-Control-Allow-Origin": "*" };
}

// ── Helpers exposed to handlers ──────────────────────────────────────────────

export function json(body: unknown, init?: { status?: number }): Response {
  return NextResponse.json(body, { status: init?.status ?? 200 });
}

export function noContent(): Response {
  return new NextResponse(null, { status: 204 });
}

// ── Authentication ───────────────────────────────────────────────────────────

const RESTRICTION_ERRORS = {
  revoked: [401, "Cette clé API a été révoquée."],
  expired: [401, "Cette clé API a expiré."],
  ip_not_allowed: [403, "Cette clé n'est pas autorisée depuis cette adresse IP."],
  origin_not_allowed: [403, "Cette clé n'est pas autorisée depuis cette origine."],
} as const;

/** A recognised key that may not be used right now (revoked, expired, wrong IP/origin). */
class KeyRestrictedError extends HttpError {
  readonly apiKey: ApiKey;
  constructor(status: number, message: string, apiKey: ApiKey) {
    super(status, message);
    this.apiKey = apiKey;
  }
}

async function authenticate(req: NextRequest, ip: string, origin: string | null): Promise<V1Auth> {
  const fail = async (): Promise<never> => {
    // Every failed attempt burns the caller IP's budget → brute-force is throttled.
    const r = await rateLimit(`apiv1:authfail:${ip}`, AUTH_FAIL_LIMIT, WINDOW_SEC);
    if (!r.ok) {
      throw new HttpError(429, "Trop de tentatives d'authentification. Réessaie plus tard.", {
        headers: rateLimitHeaders(r),
      });
    }
    throw new HttpError(401, "Clé API invalide ou manquante.", { headers: { "WWW-Authenticate": 'Bearer realm="drivecord"' } });
  };

  const header = req.headers.get("authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!isWellFormedApiKey(raw)) return fail();

  const apiKey = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(raw) }, include: { webhook: true } });
  if (!apiKey) return fail();

  const restriction = checkKeyRestrictions(apiKey, { ip, origin });
  if (restriction) {
    const [status, message] = RESTRICTION_ERRORS[restriction];
    // Carry the key so the error response can still be attributed / echo its origin.
    throw new KeyRestrictedError(status, message, apiKey);
  }

  if (!apiKey.lastUsedAt || Date.now() - apiKey.lastUsedAt.getTime() > LAST_USED_GRANULARITY_MS) {
    prisma.apiKey.update({ where: { id: apiKey.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
  }
  return { apiKey, webhook: apiKey.webhook };
}

// ── The wrapper ──────────────────────────────────────────────────────────────

type RouteOptions = {
  /** Route pattern for the audit log, e.g. `/api/v1/files/[id]` — never the concrete URL. */
  route: string;
  /** Required capability; `null` = any valid key. */
  scope: ApiScope | null;
  bucket?: Bucket;
};

export function v1Route<P extends Record<string, string> = Record<string, never>>(
  opts: RouteOptions,
  handler: (ctx: V1Context<P>) => Promise<Response>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }): Promise<Response> => {
    const ip = getClientIp(req);
    const origin = req.headers.get("origin");
    const bucket = opts.bucket ?? BUCKETS.default;
    let auth: V1Auth | null = null;
    let keyRef: ApiKey | null = null;
    let rl: RateLimitResult | null = null;

    const finish = (res: Response): Response => {
      for (const [k, v] of Object.entries(corsHeaders(origin, keyRef))) res.headers.set(k, v);
      if (rl) for (const [k, v] of Object.entries(rateLimitHeaders(rl))) res.headers.set(k, v);
      if (!res.headers.has("Cache-Control")) res.headers.set("Cache-Control", "no-store");
      res.headers.set("X-Content-Type-Options", "nosniff");
      // Phase 1.6: v1 is frozen — announce its retirement (RFC 9745 Deprecation, RFC 8594 Sunset).
      res.headers.set("Deprecation", "true");
      res.headers.set("Sunset", "Wed, 30 Sep 2027 00:00:00 GMT");
      res.headers.set("Link", '</api/v2>; rel="successor-version", </docs/api-v2>; rel="deprecation"');
      after(() =>
        recordAudit({
          apiKeyId: keyRef?.id ?? null,
          userId: keyRef?.userId ?? null,
          route: opts.route,
          method: req.method,
          status: res.status,
          ip,
        }),
      );
      return res;
    };

    try {
      try {
        auth = await authenticate(req, ip, origin);
      } catch (e) {
        if (e instanceof KeyRestrictedError) keyRef = e.apiKey;
        throw e;
      }
      keyRef = auth.apiKey;

      rl = await rateLimit(`apiv1:${bucket.name}:${auth.apiKey.id}`, bucket.limit, WINDOW_SEC);
      if (!rl.ok) {
        throw new HttpError(429, "Trop de requêtes. Réessaie plus tard.", { headers: rateLimitHeaders(rl) });
      }
      const userRl = await rateLimit(`apiv1:user:${auth.apiKey.userId}`, USER_LIMIT, WINDOW_SEC);
      if (!userRl.ok) {
        throw new HttpError(429, "Trop de requêtes pour ce compte. Réessaie plus tard.", { headers: rateLimitHeaders(userRl) });
      }

      if (opts.scope && !keyHasScope(auth.apiKey, opts.scope)) {
        throw new HttpError(403, "Cette clé n'a pas la permission requise.", { extra: { requiredScope: opts.scope } });
      }

      const params = await routeCtx.params;
      return finish(await handler({ req, auth, params }));
    } catch (err) {
      if (err instanceof UploadError) {
        return finish(NextResponse.json({ error: err.message }, { status: err.status }));
      }
      if (err instanceof HttpError) {
        const res = NextResponse.json({ error: err.message, ...(err.extra ?? {}) }, { status: err.status, headers: err.headers });
        return finish(res);
      }
      const { DiscordApiError } = await import("@/lib/discord");
      if (err instanceof DiscordApiError) {
        // Never relay Discord's raw message: it can carry webhook ids/urls.
        console.warn("[api-v1] discord error", err.category, err.status);
        return finish(NextResponse.json({ error: "Discord a refusé ou n'a pas pu traiter la requête." }, { status: 502 }));
      }
      console.error("[api-v1] unexpected error", err);
      return finish(NextResponse.json({ error: "Erreur interne." }, { status: 500 }));
    }
  };
}
