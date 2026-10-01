/**
 * Request pipeline of every `/api/v2` route:
 *
 *   bearer → (brute-force throttle) → principal → origin allowlist → rate limits →
 *   capability → [Idempotency-Key] → handler → uniform errors, CORS (exact origin only,
 *   never `*`), RateLimit-* headers, audit log.
 */
import { after, NextResponse, type NextRequest } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getClientIp, rateLimit, rateLimitHeaders, type RateLimitResult } from "@/lib/rate-limit";
import { recordAudit } from "@/lib/api-v1/audit";
import { tokenKindOf } from "@/lib/oauth/core";
import { ApiError } from "./errors";
import { MAX_BODY_BYTES, parseJsonObject } from "./validate";
import { authenticatePrincipal, can, principalId, type Capability, type Principal } from "./principal";

export const BUCKETS = {
  read: { name: "read", limit: 240 },
  write: { name: "write", limit: 120 },
  /** One call per 8 MiB chunk: a big file needs many. Discord's own pacing is the real ceiling. */
  chunks: { name: "chunks", limit: 600 },
  delete: { name: "delete", limit: 60 },
  share: { name: "share", limit: 60 },
} as const;
export type Bucket = (typeof BUCKETS)[keyof typeof BUCKETS];

const WINDOW_SEC = 60;
const USER_LIMIT = 1200;
const AUTH_FAIL_LIMIT = 30;

export type V2Context<P> = {
  req: NextRequest;
  principal: Principal;
  params: P;
  requestId: string;
  /** Parsed JSON body (only for routes declared with `json: true`). */
  body: Record<string, unknown>;
};

type Options = {
  cap: Capability;
  bucket: Bucket;
  /** Route pattern for the audit log. */
  route: string;
  /** Read + size-check a JSON body up front (enables Idempotency-Key for POSTs). */
  json?: boolean;
  /** Honour `Idempotency-Key` (POST only). */
  idempotent?: boolean;
};

const SECURITY_HEADERS: Record<string, string> = {
  "Cache-Control": "no-store",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; sandbox",
  Vary: "Authorization, Origin",
};

const allowedOriginsOf = (p: Principal | null) => p?.allowedOrigins ?? [];

function finalize(res: Response, requestId: string, origin: string | null, p: Principal | null, extra?: Record<string, string>) {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) if (!res.headers.has(k)) res.headers.set(k, v);
  res.headers.set("X-Request-Id", requestId);
  // Exact origin or nothing — never `*`: an authenticated API must not be readable from arbitrary sites.
  if (origin && allowedOriginsOf(p).includes(origin)) {
    res.headers.set("Access-Control-Allow-Origin", origin);
    res.headers.set("Access-Control-Expose-Headers", "X-Request-Id, RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset, Retry-After, Idempotent-Replay");
  }
  if (extra) for (const [k, v] of Object.entries(extra)) res.headers.set(k, v);
  return res;
}

export const ok = (body: unknown, status = 200) => NextResponse.json(body, { status });
export const noContent = () => new NextResponse(null, { status: 204 });

function errorResponse(err: ApiError, requestId: string) {
  return NextResponse.json(
    { error: { code: err.code, message: err.message, requestId, ...(err.details ?? {}) } },
    { status: err.status, headers: err.headers },
  );
}

/** CORS preflight: which methods/headers are allowed is public; WHO may read the answer is decided per request. */
export function preflight(methods: string): () => Response {
  return () =>
    new NextResponse(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": methods,
        "Access-Control-Allow-Headers": "Authorization, Content-Type, Idempotency-Key",
        "Access-Control-Max-Age": "86400",
      },
    });
}

async function authenticate(req: NextRequest, ip: string): Promise<Principal> {
  const fail = async (err: ApiError): Promise<never> => {
    const r = await rateLimit(`apiv2:authfail:${ip}`, AUTH_FAIL_LIMIT, WINDOW_SEC);
    if (!r.ok) throw new ApiError(429, "rate_limited", "Trop de tentatives d'authentification.", rateLimitHeaders(r));
    throw err;
  };
  const header = req.headers.get("authorization");
  const raw = header?.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!tokenKindOf(raw)) return fail(new ApiError(401, "unauthorized", "Jeton d'accès invalide ou manquant.", { "WWW-Authenticate": 'Bearer realm="drivecord"' }));
  const p = await authenticatePrincipal(raw);
  if (p === "unauthorized") return fail(new ApiError(401, "unauthorized", "Jeton d'accès invalide ou manquant.", { "WWW-Authenticate": 'Bearer realm="drivecord", error="invalid_token"' }));
  if (p === "token_expired") throw new ApiError(401, "token_expired", "Ce jeton a expiré.", { "WWW-Authenticate": 'Bearer realm="drivecord", error="invalid_token"' });
  return p;
}

export function v2Route<P extends Record<string, string> = Record<string, never>>(
  opts: Options,
  handler: (ctx: V2Context<P>) => Promise<Response>,
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(req);
    const origin = req.headers.get("origin");
    let principal: Principal | null = null;
    let rl: RateLimitResult | null = null;
    let status = 500;

    const done = (res: Response) => {
      status = res.status;
      after(() =>
        recordAudit({
          apiKeyId: null,
          appId: principal?.kind === "app" ? principal.appId : null,
          userId: principal?.userId ?? null,
          route: opts.route,
          method: req.method,
          status,
          ip,
        }),
      );
      return finalize(res, requestId, origin, principal, rl ? rateLimitHeaders(rl) : undefined);
    };

    try {
      principal = await authenticate(req, ip);
      if (origin && !allowedOriginsOf(principal).includes(origin)) {
        throw new ApiError(403, "origin_not_allowed", "Cette origine n'est pas autorisée pour ce jeton.");
      }

      const id = principalId(principal);
      rl = await rateLimit(`apiv2:${opts.bucket.name}:${id}`, opts.bucket.limit, WINDOW_SEC);
      if (!rl.ok) throw new ApiError(429, "rate_limited", "Trop de requêtes. Réessaie plus tard.", rateLimitHeaders(rl));
      const userRl = await rateLimit(`apiv2:user:${principal.userId}`, USER_LIMIT, WINDOW_SEC);
      if (!userRl.ok) throw new ApiError(429, "rate_limited", "Trop de requêtes pour ce compte.", rateLimitHeaders(userRl));

      if (!can(principal, opts.cap)) {
        throw new ApiError(403, "insufficient_scope", "Ce jeton n'a pas la permission requise.", undefined, { requiredCapability: opts.cap });
      }

      let body: Record<string, unknown> = {};
      let rawBody = "";
      if (opts.json) {
        const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
        if (type !== "application/json") throw new ApiError(415, "unsupported_media_type", "Content-Type doit être application/json.");
        if (Number(req.headers.get("content-length") ?? "0") > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", "Corps trop volumineux.");
        rawBody = await req.text();
        if (Buffer.byteLength(rawBody) > MAX_BODY_BYTES) throw new ApiError(413, "payload_too_large", "Corps trop volumineux.");
        body = parseJsonObject(rawBody);
      }

      const params = await routeCtx.params;
      const run = () => handler({ req, principal: principal!, params, requestId, body });

      const idemKey = opts.idempotent ? req.headers.get("idempotency-key") : null;
      if (!idemKey) return done(await run());
      if (!/^[A-Za-z0-9_\-:.]{8,128}$/.test(idemKey)) throw new ApiError(400, "invalid_request", "Idempotency-Key invalide (8 à 128 caractères).");

      // ── Idempotency: same key + same request → replay; same key + different request → 422 ──
      const scopeKey = `${id}:${idemKey}`;
      const requestHash = createHash("sha256").update(`${req.method} ${req.nextUrl.pathname}\n${rawBody}`).digest("hex");
      try {
        await prisma.idempotencyRecord.create({
          data: { scopeKey, requestHash, status: 0, responseBody: {}, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) },
        });
      } catch (e) {
        if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
        const prev = await prisma.idempotencyRecord.findUnique({ where: { scopeKey } });
        if (prev && prev.expiresAt.getTime() <= Date.now()) {
          await prisma.idempotencyRecord.deleteMany({ where: { scopeKey } });
          return done(await run()); // expired record: behave as a first call (rare; storage skipped)
        }
        if (!prev || prev.requestHash !== requestHash) throw new ApiError(422, "idempotency_key_reuse", "Cette Idempotency-Key a déjà servi pour une requête différente.");
        if (prev.status === 0) throw new ApiError(409, "idempotency_in_progress", "Une requête identique est en cours de traitement.", { "Retry-After": "1" });
        const replay = NextResponse.json(prev.responseBody, { status: prev.status, headers: { "Idempotent-Replay": "true" } });
        return done(replay);
      }

      let res: Response;
      try {
        res = await run();
      } catch (err) {
        await prisma.idempotencyRecord.deleteMany({ where: { scopeKey } }); // a failed attempt must stay retryable
        throw err;
      }
      if (res.status >= 500 || !(res.headers.get("content-type") ?? "").includes("json")) {
        await prisma.idempotencyRecord.deleteMany({ where: { scopeKey } });
      } else {
        const json = await res.clone().json().catch(() => ({}));
        await prisma.idempotencyRecord.update({ where: { scopeKey }, data: { status: res.status, responseBody: json } });
      }
      return done(res);
    } catch (err) {
      if (err instanceof ApiError) return done(errorResponse(err, requestId));
      console.error(`[api-v2] ${requestId}`, err);
      return done(errorResponse(new ApiError(500, "internal_error", "Erreur interne."), requestId));
    }
  };
}
