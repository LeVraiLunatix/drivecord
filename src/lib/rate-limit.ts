/**
 * Fixed-window rate limiting backed by PostgreSQL (no Redis dependency).
 *
 * Each logical action gets a key like "emailcode:send:ip:1.2.3.4". A row tracks
 * the request count within a window; once the window expires the counter resets
 * on the next hit. Best-effort under serverless concurrency (a rare double-spend
 * at the window edge is acceptable for abuse protection).
 */
import { prisma } from "@/lib/prisma";

export type RateLimitResult = {
  /** Whether the request is allowed. */
  ok: boolean;
  /** Configured ceiling for the window. */
  limit: number;
  /** Remaining units in the current window. */
  remaining: number;
  /** Seconds until the window resets. */
  resetSec: number;
  /** Seconds to wait before retrying (only meaningful when `ok` is false). */
  retryAfterSec: number;
};

/**
 * Consume `amount` units (default 1) against `key`: at most `limit` units per
 * `windowSec`. The read-modify-write is ONE atomic `INSERT … ON CONFLICT DO
 * UPDATE … RETURNING`, so concurrent requests can't all slip under the limit.
 *
 * `refundOnReject` gives the units back when the call is refused — for byte
 * quotas, where a rejected upload must not eat the remaining budget. Request
 * counters leave it off: blocked attempts keep the window closed (a client
 * hammering a 429 shouldn't get a fresh allowance).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  opts: { amount?: number; refundOnReject?: boolean } = {},
): Promise<RateLimitResult> {
  const amount = opts.amount ?? 1;
  const now = new Date();
  const freshExpiry = new Date(now.getTime() + windowSec * 1000);

  const rows = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "expiresAt", "createdAt")
    VALUES (${crypto.randomUUID()}, ${key}, ${amount}, ${freshExpiry}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."expiresAt" <= ${now}
                     THEN EXCLUDED."count"
                     ELSE "RateLimit"."count" + EXCLUDED."count" END,
      "expiresAt" = CASE WHEN "RateLimit"."expiresAt" <= ${now}
                         THEN EXCLUDED."expiresAt"
                         ELSE "RateLimit"."expiresAt" END
    RETURNING "count", "expiresAt"`;
  const row = rows[0]!;
  const count = Number(row.count);
  const resetSec = Math.max(1, Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000));
  const ok = count <= limit;

  if (!ok && opts.refundOnReject) {
    await prisma.$executeRaw`UPDATE "RateLimit" SET "count" = GREATEST(0, "count" - ${amount}) WHERE "key" = ${key}`;
  }

  return {
    ok,
    limit,
    remaining: Math.max(0, limit - count),
    resetSec,
    retryAfterSec: ok ? 0 : resetSec,
  };
}

/** Standard `RateLimit-*` response headers (IETF draft) for a result. */
export function rateLimitHeaders(r: RateLimitResult): Record<string, string> {
  return {
    "RateLimit-Limit": String(r.limit),
    "RateLimit-Remaining": String(r.remaining),
    "RateLimit-Reset": String(r.resetSec),
    ...(r.ok ? {} : { "Retry-After": String(r.retryAfterSec) }),
  };
}

/** Best-effort client IP from proxy headers (Vercel sets x-forwarded-for). */
export function getClientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") ?? "unknown";
}

/** Opportunistic cleanup of expired rate-limit rows (call sparingly). */
export async function purgeExpiredRateLimits(): Promise<void> {
  await prisma.rateLimit.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}
