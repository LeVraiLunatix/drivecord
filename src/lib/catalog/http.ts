/**
 * Plumbing for the public, read-only side of the catalog (`/api/catalog/*`): no account, no
 * token, IP rate limit, open CORS (it only ever returns what anyone could browse anyway) and the
 * same uniform error shape as `/api/v2`.
 */
import { NextResponse, type NextRequest } from "next/server";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { ApiError } from "@/lib/api-v2/errors";

const CORS = { "Access-Control-Allow-Origin": "*" };
const READ_LIMIT = 240;

export const catalogPreflight = (methods: string) => () =>
  new NextResponse(null, {
    status: 204,
    headers: { ...CORS, "Access-Control-Allow-Methods": methods, "Access-Control-Max-Age": "86400" },
  });

type Ctx<P> = { req: NextRequest; params: P; ip: string };

export function publicRoute<P extends Record<string, string> = Record<string, never>>(
  handler: (ctx: Ctx<P>) => Promise<Response>,
  opts: { cache?: string } = {},
) {
  return async (req: NextRequest, routeCtx: { params: Promise<P> }): Promise<Response> => {
    const requestId = crypto.randomUUID();
    const ip = getClientIp(req);
    try {
      const rl = await rateLimit(`catalog:read:ip:${ip}`, READ_LIMIT, 60);
      if (!rl.ok) throw new ApiError(429, "rate_limited", "Trop de requêtes. Réessaie plus tard.", rateLimitHeaders(rl));
      const res = await handler({ req, params: await routeCtx.params, ip });
      for (const [k, v] of Object.entries(CORS)) res.headers.set(k, v);
      res.headers.set("X-Content-Type-Options", "nosniff");
      res.headers.set("X-Request-Id", requestId);
      if (opts.cache && !res.headers.has("Cache-Control")) res.headers.set("Cache-Control", opts.cache);
      return res;
    } catch (err) {
      const api = err instanceof ApiError ? err : new ApiError(500, "internal_error", "Erreur interne.");
      if (!(err instanceof ApiError)) console.error(`[catalog] ${requestId}`, err);
      return NextResponse.json(
        { error: { code: api.code, message: api.message, requestId, ...(api.details ?? {}) } },
        { status: api.status, headers: { ...CORS, "X-Request-Id": requestId, ...(api.headers ?? {}) } },
      );
    }
  };
}
