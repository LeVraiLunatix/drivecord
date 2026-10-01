/**
 * The actual checks behind `/api/health` and `/api/health/components`.
 *
 * Every check is read-only and free of side effects: no email is sent, no push is delivered, nothing is
 * written. When a service has no such check, it reports `unknown` rather than guessing.
 * Results are cached briefly so a burst of polls never turns into a burst of upstream calls.
 */
import { prisma } from "@/lib/prisma";
import { buildPayload, measure, parseMaintenance, type ComponentHealth, type ComponentsPayload } from "@/lib/health-core";

const ttl = <T,>(ms: number, fn: () => Promise<T>) => {
  let cache: { at: number; value: T } | null = null;
  let inflight: Promise<T> | null = null;
  return async (): Promise<T> => {
    if (cache && Date.now() - cache.at < ms) return cache.value;
    inflight ??= fn()
      .then((value) => {
        cache = { at: Date.now(), value };
        return value;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };
};

/** A reachable-or-not check of a third-party HTTP API. Any answer below 500 means "reachable". */
const reachable = (url: string, init: RequestInit = {}) => async () => {
  const res = await fetch(url, { ...init, cache: "no-store", headers: { "User-Agent": "Drivecord-Health/1", ...init.headers } });
  if (res.status >= 500) throw new Error(`upstream ${res.status}`);
};

export const checkDb = (): Promise<ComponentHealth> =>
  measure(() => prisma.$queryRaw`select 1`, 2500).then((r) => ({ id: "db", ...r }));

/** Discord's public gateway endpoint: a stand-in for "the API webhooks go through is up". */
export const checkDiscord = ttl(30_000, async (): Promise<ComponentHealth> => {
  const r = await measure(async () => {
    const res = await fetch("https://discord.com/api/v10/gateway", { cache: "no-store" });
    if (!res.ok) throw new Error(`discord ${res.status}`);
  }, 3000);
  return { id: "discord", ...r };
});

/** The authentication stack: its secret is configured and the user table answers. */
export const checkAuth = async (): Promise<ComponentHealth> => {
  if (!process.env.AUTH_SECRET) return { id: "auth", status: "down", latencyMs: null };
  const r = await measure(() => prisma.$queryRaw`select 1 from "User" limit 1`, 2500);
  return { id: "auth", ...r };
};

/** Resend's API, probed with a read-only call (listing domains). Nothing is sent. */
export const checkEmail = ttl(60_000, async (): Promise<ComponentHealth> => {
  const key = process.env.AUTH_RESEND_KEY;
  if (!key) return { id: "email", status: "unknown", latencyMs: null };
  const r = await measure(reachable("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${key}` } }), 3000);
  return { id: "email", ...r };
});

/**
 * APNs offers no way to check delivery without pushing to a real device, which would be a visible side
 * effect — so this honestly reports `unknown` instead of pretending.
 */
export const checkPush = async (): Promise<ComponentHealth> => ({ id: "push", status: "unknown", latencyMs: null });

/** Patreon's API host, unauthenticated: a 401 proves it is up (this app's tokens are never used here). */
export const checkPatreon = ttl(60_000, async (): Promise<ComponentHealth> => {
  if (!process.env.AUTH_PATREON_ID) return { id: "patreon", status: "unknown", latencyMs: null };
  const r = await measure(reachable("https://www.patreon.com/api/oauth2/v2/identity"), 3000);
  return { id: "patreon", ...r };
});

export const readMaintenance = () => parseMaintenance(process.env.MAINTENANCE_MESSAGE, process.env.MAINTENANCE_COMPONENTS);

/** Everything the status page needs, cached 15 s. */
export const getComponentsPayload = ttl(15_000, async (): Promise<ComponentsPayload> => {
  const list = await Promise.all([checkDb(), checkDiscord(), checkAuth(), checkEmail(), checkPush(), checkPatreon()]);
  return buildPayload(list, readMaintenance());
});
