/**
 * Drivecord → Compte Cord (server only). Publishes the Drivecord tile status on
 * the Cord hub and sends a few useful notifications. Never blocking: callers
 * use the `after*` helpers, which run once the response is sent, and every
 * failure is logged, never surfaced to the user. Logic + tests: cord-sync-core.ts.
 *
 * Rate limits live in the existing `RateLimit` table (serverless-safe, no
 * schema change): `cord:status:<uid>` (1 / 5 min), `cord:notify:…`, and
 * `cord:off:<uid>` which remembers a `not_connected` answer for 24 h (cleared
 * as soon as the user signs in with Cord again).
 */
import "server-only";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  createCordSync,
  NOT_CONNECTED_TTL_SEC,
  type CordNotification,
  type CordSyncResult,
  type NotifyOptions,
} from "@/lib/cord-sync-core";

export { DRIVECORD_URL } from "@/lib/cord-sync-core";

const offKey = (userId: string) => `cord:off:${userId}`;

const sync = createCordSync({
  config: () => {
    const issuer = process.env.AUTH_CORD_ISSUER;
    const clientId = process.env.AUTH_CORD_ID;
    const clientSecret = process.env.AUTH_CORD_SECRET;
    return issuer && clientId && clientSecret ? { issuer, clientId, clientSecret } : null;
  },
  fetch: (...args) => fetch(...args),
  now: () => new Date(),
  getSub: async (userId) => {
    const row = await prisma.account.findFirst({
      where: { userId, provider: "cord" },
      select: { providerAccountId: true },
    });
    return row?.providerAccountId ?? null;
  },
  getStats: async (userId) => {
    const [files, drives, shares] = await Promise.all([
      prisma.driveFile.aggregate({
        where: { webhook: { userId }, trashed: false },
        _count: { _all: true },
        _sum: { size: true },
        _max: { createdAt: true },
      }),
      prisma.webhook.count({ where: { userId } }),
      prisma.share.count({
        where: {
          webhook: { userId },
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);
    return {
      bytes: Number(files._sum.size ?? 0),
      files: files._count._all,
      drives,
      shares,
      lastUploadAt: files._max.createdAt ?? null,
    };
  },
  acquire: async (key, limit, windowSec) => (await rateLimit(key, limit, windowSec)).ok,
  isDisconnected: async (userId) => {
    const row = await prisma.rateLimit.findUnique({ where: { key: offKey(userId) } });
    return Boolean(row && row.expiresAt > new Date());
  },
  markDisconnected: async (userId) => {
    const expiresAt = new Date(Date.now() + NOT_CONNECTED_TTL_SEC * 1000);
    await prisma.rateLimit.upsert({
      where: { key: offKey(userId) },
      create: { key: offKey(userId), count: 1, expiresAt },
      update: { count: 1, expiresAt },
    });
  },
  log: (message, detail) => console.warn(`[cord-sync] ${message}`, detail ?? ""),
});

export const pushCordStatus = (userId: string): Promise<CordSyncResult> => sync.pushStatus(userId);

export const notifyCord = (
  userId: string,
  n: CordNotification,
  opts?: NotifyOptions,
): Promise<CordSyncResult> => sync.notify(userId, n, opts);

export const clearCordStatus = (sub: string): Promise<CordSyncResult> => sync.clearStatus(sub);

/**
 * Fresh Cord sign-in (or link): the user (re)authorized Drivecord, so forget a
 * previous `not_connected` and let the next status push go through at once.
 */
export async function resetCordSync(userId: string): Promise<void> {
  await prisma.rateLimit
    .deleteMany({ where: { key: { in: [offKey(userId), `cord:status:${userId}`] } } })
    .catch(() => {});
}

/** Run after the response; outside a request scope, fire and forget. */
function later(task: () => Promise<unknown>): void {
  const run = () => task().catch((e) => console.warn("[cord-sync]", e));
  try {
    after(run);
  } catch {
    void run();
  }
}

export function afterCordStatus(userId: string | null | undefined): void {
  if (userId) later(() => pushCordStatus(userId));
}

/** At sign-in: refresh the tile; a Cord sign-in also lifts a previous `not_connected`. */
export function afterCordSignIn(userId: string | null | undefined, viaCord: boolean): void {
  if (!userId) return;
  later(async () => {
    if (viaCord) await resetCordSync(userId);
    return pushCordStatus(userId);
  });
}

export function afterCordNotify(
  userId: string | null | undefined,
  n: CordNotification,
  opts?: NotifyOptions,
): void {
  if (userId) later(() => notifyCord(userId, n, opts));
}

export function afterCordClear(sub: string | null | undefined): void {
  if (sub) later(() => clearCordStatus(sub));
}
