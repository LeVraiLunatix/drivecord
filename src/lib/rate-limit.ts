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
  /** Remaining requests in the current window. */
  remaining: number;
  /** Seconds until the window resets (only meaningful when `ok` is false). */
  retryAfterSec: number;
};

/**
 * Consume one unit against `key`. Allows up to `limit` hits per `windowSec`.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const existing = await prisma.rateLimit.findUnique({ where: { key } });

  // Fresh window: no row, or the previous window already expired.
  if (!existing || existing.expiresAt <= now) {
    const expiresAt = new Date(now.getTime() + windowSec * 1000);
    await prisma.rateLimit.upsert({
      where: { key },
      create: { key, count: 1, expiresAt },
      update: { count: 1, expiresAt },
    });
    return { ok: true, remaining: limit - 1, retryAfterSec: 0 };
  }

  // Within an active window but over the limit.
  if (existing.count >= limit) {
    const retryAfterSec = Math.max(
      1,
      Math.ceil((existing.expiresAt.getTime() - now.getTime()) / 1000),
    );
    return { ok: false, remaining: 0, retryAfterSec };
  }

  const updated = await prisma.rateLimit.update({
    where: { key },
    data: { count: { increment: 1 } },
  });
  return {
    ok: true,
    remaining: Math.max(0, limit - updated.count),
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
