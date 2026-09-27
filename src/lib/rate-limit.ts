/**
 * Fixed-window rate limiting backed by PostgreSQL (no Redis dependency).
 *
 * Each logical action gets a key like "emailcode:send:ip:1.2.3.4". A row tracks
 * the request count within a window; once the window expires the counter resets
 * on the next hit. Best-effort under serverless concurrency (a rare double-spend
 * at the window edge is acceptable for abuse protection).
 */
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";

export type RateLimitResult = {
  /** Whether the request is allowed. */
  ok: boolean;
  /** Remaining requests in the current window. */
  remaining: number;
  /** Seconds until the window resets (only meaningful when `ok` is false). */
  retryAfterSec: number;
};

/**
 * Consume one unit against `key`. Allows up to `limit` hits per `windowSec`.
 *
 * Single atomic statement (no read-then-write race): `INSERT ... ON CONFLICT`
 * either creates a fresh window (count = 1) or, if the existing row's window
 * already expired, resets it to count = 1 with a new expiry — and otherwise
 * increments the existing count, all inside one round-trip so concurrent
 * requests can't all read the same "under limit" count and each write their
 * own increment on top of it (the read-then-`update`/`upsert` this replaced
 * could allow a burst to slip a few requests past `limit` under load).
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + windowSec * 1000);

  const rows = await prisma.$queryRaw<{ count: number; expiresAt: Date }[]>`
    INSERT INTO "RateLimit" ("id", "key", "count", "expiresAt", "createdAt")
    VALUES (${randomUUID()}, ${key}, 1, ${expiresAt}, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimit"."expiresAt" <= ${now} THEN 1
        ELSE "RateLimit"."count" + 1
      END,
      "expiresAt" = CASE
        WHEN "RateLimit"."expiresAt" <= ${now} THEN ${expiresAt}
        ELSE "RateLimit"."expiresAt"
      END
    RETURNING "count", "expiresAt"
  `;
  const row = rows[0]!;

  if (row.count > limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((row.expiresAt.getTime() - now.getTime()) / 1000),
    );
    return { ok: false, remaining: 0, retryAfterSec };
  }

  return {
    ok: true,
    remaining: Math.max(0, limit - row.count),
    retryAfterSec: 0,
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
