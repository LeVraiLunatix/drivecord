/**
 * Compte Cord — interconnection API (Drivecord server → Compte Cord), pure core.
 *
 * Everything with I/O (Prisma, env, fetch, clock) is injected so this file is
 * unit-tested in `cord-sync-core.test.ts`. The wired, server-only version lives
 * in `cord-sync.ts`.
 *
 * Contract (compte.cordsuite.app, README « Interconnexion ») :
 *  - POST/DELETE /api/apps/status, POST /api/apps/notify, authenticated with
 *    the OIDC client secret in the JSON body.
 *  - `sub` = the user's Cord id (`Account.providerAccountId`, provider "cord").
 *  - 404 { reason: "not_connected" } → the user revoked Drivecord: don't retry.
 *  - headline ≤ 80, detail ≤ 140, ≤ 4 metrics (label/value ≤ 24), title ≤ 80,
 *    body ≤ 240; `url` must be HTTPS on drivecord.app / www. / drivecord.vercel.app.
 *  - Quotas: 120 status updates and 30 notifications per hour and per user.
 *
 * Nothing here ever throws: every entry point resolves to a `CordSyncResult`.
 */

/** Public origin used in every link sent to Cord (must be an allowed host). */
export const DRIVECORD_URL = "https://drivecord.app";
/** At most one status push per user every 5 minutes. */
export const STATUS_INTERVAL_SEC = 5 * 60;
/** Our own ceiling for notifications, below Cord's 30/h. */
export const NOTIFY_LIMIT_PER_HOUR = 20;
/** A user who revoked Drivecord isn't asked again for this long (reset on Cord sign-in). */
export const NOT_CONNECTED_TTL_SEC = 24 * 60 * 60;
export const CORD_TIMEOUT_MS = 3000;

const ALLOWED_HOSTS = new Set(["drivecord.app", "www.drivecord.app", "drivecord.vercel.app"]);

export type CordSyncResult =
  | "ok"
  | "disabled" // Cord env not configured
  | "skipped" // user has no linked Cord account
  | "throttled" // our own rate limit
  | "not_connected" // Cord says the user revoked Drivecord
  | "error"; // network / HTTP / DB error (logged)

export type CordConfig = { issuer: string; clientId: string; clientSecret: string };

export type CordStats = {
  bytes: number;
  files: number;
  drives: number;
  shares: number;
  lastUploadAt: Date | null;
};

export type CordMetric = { label: string; value: string };
export type CordStatus = { headline: string; detail?: string; metrics: CordMetric[]; url: string };
export type CordNotification = { title: string; body?: string; url: string };

// ── Formatting ───────────────────────────────────────────────────────────────

function clip(s: string, max: number): string {
  const t = s.trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

const nf1 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** "12,4 Go", "850 Mo", "0 o" — French units, base 1024 like the rest of the app. */
export function formatBytesFr(bytes: number): string {
  const units = ["o", "Ko", "Mo", "Go", "To", "Po"];
  let n = Math.max(0, bytes);
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  // U+202F (narrow no-break space) from Intl is replaced by a plain space so
  // the hub never wraps "1 834" awkwardly and length checks stay predictable.
  const num = (i === 0 || n >= 100 ? nf0 : nf1).format(n).replace(/\s/g, " ");
  return `${num} ${units[i]}`;
}

export function formatCountFr(n: number): string {
  return nf0.format(Math.max(0, Math.trunc(n))).replace(/\s/g, " ");
}

/** "à l’instant", "il y a 5 min", "il y a 2 h", "il y a 3 j", "le 12/03/2026". */
export function formatAgoFr(date: Date, now: Date): string {
  const sec = Math.max(0, Math.round((now.getTime() - date.getTime()) / 1000));
  if (sec < 60) return "à l’instant";
  const min = Math.round(sec / 60);
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  const d = Math.round(h / 24);
  if (d < 30) return `il y a ${d} j`;
  return `le ${date.toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" })}`;
}

const plural = (n: number, one: string, many: string) => `${formatCountFr(n)} ${n > 1 ? many : one}`;

/** Status shown on the Drivecord tile of the Cord hub. */
export function buildCordStatus(stats: CordStats, now: Date): CordStatus {
  const headline =
    stats.files === 0 ? "Aucun fichier pour l’instant" : `${formatBytesFr(stats.bytes)} stockés`;
  const parts = [plural(stats.drives, "drive", "drives")];
  if (stats.lastUploadAt) parts.push(`dernier envoi ${formatAgoFr(stats.lastUploadAt, now)}`);
  const metrics: CordMetric[] = [
    { label: "Fichiers", value: formatCountFr(stats.files) },
    { label: "Drives", value: formatCountFr(stats.drives) },
  ];
  if (stats.shares > 0) metrics.push({ label: "Liens partagés", value: formatCountFr(stats.shares) });
  return {
    headline: clip(headline, 80),
    detail: clip(parts.join(" · "), 140),
    metrics: metrics.slice(0, 4).map((m) => ({ label: clip(m.label, 24), value: clip(m.value, 24) })),
    url: `${DRIVECORD_URL}/drive`,
  };
}

/** Cord refuses (400) any link outside drivecord.app / www. / drivecord.vercel.app over HTTPS. */
export function isAllowedCordUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && ALLOWED_HOSTS.has(u.hostname) && !u.port;
  } catch {
    return false;
  }
}

/** Clip to Cord's limits; a disallowed link falls back to the drive. */
export function normalizeNotification(n: CordNotification): CordNotification {
  return {
    title: clip(n.title, 80),
    ...(n.body ? { body: clip(n.body, 240) } : {}),
    url: isAllowedCordUrl(n.url) ? n.url : `${DRIVECORD_URL}/drive`,
  };
}

// ── Sync engine ──────────────────────────────────────────────────────────────

export type CordSyncDeps = {
  config: () => CordConfig | null;
  fetch: typeof fetch;
  now: () => Date;
  /** Cord `sub` of the user's linked account, or null. */
  getSub: (userId: string) => Promise<string | null>;
  getStats: (userId: string) => Promise<CordStats>;
  /**
   * Consume one hit on `key` (at most `limit` per `windowSec`, stored in the
   * DB so it holds across serverless instances). `false` = over the limit.
   */
  acquire: (key: string, limit: number, windowSec: number) => Promise<boolean>;
  isDisconnected: (userId: string) => Promise<boolean>;
  markDisconnected: (userId: string) => Promise<void>;
  log: (message: string, detail?: unknown) => void;
};

export type NotifyOptions = {
  /** Extra per-kind limit, e.g. { key: "backup", limit: 3, windowSec: 3600 }. */
  kind?: { key: string; limit: number; windowSec: number };
};

export function createCordSync(deps: CordSyncDeps) {
  async function call(
    method: "POST" | "DELETE",
    path: "/api/apps/status" | "/api/apps/notify",
    cfg: CordConfig,
    payload: Record<string, unknown>,
  ): Promise<"ok" | "not_connected" | "error"> {
    const url = `${cfg.issuer.replace(/\/+$/, "")}${path}`;
    try {
      const res = await deps.fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ client_id: cfg.clientId, client_secret: cfg.clientSecret, ...payload }),
        signal: AbortSignal.timeout(CORD_TIMEOUT_MS),
        cache: "no-store",
      });
      if (res.ok) return "ok";
      const data = (await res.json().catch(() => null)) as { reason?: string; error?: string } | null;
      if (res.status === 404 && data?.reason === "not_connected") return "not_connected";
      deps.log(`${method} ${path} → HTTP ${res.status}`, data?.error ?? data?.reason);
      return "error";
    } catch (e) {
      deps.log(`${method} ${path} → échec réseau`, (e as Error)?.name ?? e);
      return "error";
    }
  }

  /** Resolve config + sub and skip revoked users. */
  async function target(userId: string): Promise<{ cfg: CordConfig; sub: string } | CordSyncResult> {
    const cfg = deps.config();
    if (!cfg) return "disabled";
    const sub = await deps.getSub(userId);
    if (!sub) return "skipped";
    if (await deps.isDisconnected(userId)) return "not_connected";
    return { cfg, sub };
  }

  async function settle(userId: string, r: "ok" | "not_connected" | "error"): Promise<CordSyncResult> {
    if (r === "not_connected") await deps.markDisconnected(userId);
    return r;
  }

  return {
    /** Recompute the user's numbers and publish them on the Drivecord tile (≤ 1 / 5 min). */
    async pushStatus(userId: string): Promise<CordSyncResult> {
      try {
        const t = await target(userId);
        if (typeof t === "string") return t;
        if (!(await deps.acquire(`cord:status:${userId}`, 1, STATUS_INTERVAL_SEC))) return "throttled";
        const status = buildCordStatus(await deps.getStats(userId), deps.now());
        return settle(userId, await call("POST", "/api/apps/status", t.cfg, { sub: t.sub, status }));
      } catch (e) {
        deps.log("pushStatus", e);
        return "error";
      }
    },

    /** Bell + « Fil de la suite » notification. Always carries a drivecord.app link. */
    async notify(userId: string, n: CordNotification, opts: NotifyOptions = {}): Promise<CordSyncResult> {
      try {
        const t = await target(userId);
        if (typeof t === "string") return t;
        if (opts.kind) {
          const { key, limit, windowSec } = opts.kind;
          if (!(await deps.acquire(`cord:notify:${key}:${userId}`, limit, windowSec))) return "throttled";
        }
        if (!(await deps.acquire(`cord:notify:${userId}`, NOTIFY_LIMIT_PER_HOUR, 3600))) return "throttled";
        const payload = normalizeNotification(n);
        return settle(userId, await call("POST", "/api/apps/notify", t.cfg, { sub: t.sub, ...payload }));
      } catch (e) {
        deps.log("notify", e);
        return "error";
      }
    },

    /** Remove the Drivecord tile status (on unlink / account deletion). Takes the sub: the row may be gone. */
    async clearStatus(sub: string): Promise<CordSyncResult> {
      const cfg = deps.config();
      if (!cfg) return "disabled";
      const r = await call("DELETE", "/api/apps/status", cfg, { sub });
      // Already revoked on Cord's side: nothing left to clear.
      return r === "not_connected" ? "ok" : r;
    },
  };
}

export type CordSync = ReturnType<typeof createCordSync>;
