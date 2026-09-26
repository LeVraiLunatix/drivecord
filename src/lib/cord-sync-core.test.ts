import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCordStatus,
  createCordSync,
  formatAgoFr,
  formatBytesFr,
  isAllowedCordUrl,
  normalizeNotification,
  NOTIFY_LIMIT_PER_HOUR,
  type CordStats,
  type CordSyncDeps,
} from "./cord-sync-core.ts";

const NOW = new Date("2026-09-26T12:00:00Z");
const STATS: CordStats = {
  bytes: 12.4 * 1024 ** 3,
  files: 1834,
  drives: 3,
  shares: 0,
  lastUploadAt: new Date(NOW.getTime() - 2 * 3600 * 1000),
};

type Call = { url: string; method: string; body: Record<string, unknown> };

/** In-memory deps: a fake fetch that records calls and a fixed-window limiter with a controllable clock. */
function harness(opts: { sub?: string | null; respond?: (c: Call) => Response | Promise<Response>; config?: boolean } = {}) {
  const calls: Call[] = [];
  const logs: string[] = [];
  const windows = new Map<string, { count: number; until: number }>();
  const off = new Set<string>();
  let clock = NOW.getTime();

  const deps: CordSyncDeps = {
    config: () =>
      opts.config === false
        ? null
        : { issuer: "https://compte.cordsuite.app/", clientId: "drivecord", clientSecret: "s3cret" },
    fetch: (async (input: string | URL | Request, init?: RequestInit) => {
      const call = { url: String(input), method: init?.method ?? "GET", body: JSON.parse(String(init?.body ?? "{}")) };
      calls.push(call);
      return opts.respond ? opts.respond(call) : new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch,
    now: () => new Date(clock),
    getSub: async () => (opts.sub === undefined ? "cord_abc" : opts.sub),
    getStats: async () => STATS,
    acquire: async (key, limit, windowSec) => {
      const w = windows.get(key);
      if (!w || w.until <= clock) {
        windows.set(key, { count: 1, until: clock + windowSec * 1000 });
        return true;
      }
      if (w.count >= limit) return false;
      w.count++;
      return true;
    },
    isDisconnected: async (uid) => off.has(uid),
    markDisconnected: async (uid) => void off.add(uid),
    log: (m) => void logs.push(m),
  };
  return { sync: createCordSync(deps), calls, logs, off, advance: (sec: number) => (clock += sec * 1000) };
}

test("formatBytesFr / formatAgoFr speak French", () => {
  assert.equal(formatBytesFr(0), "0 o");
  assert.equal(formatBytesFr(12.4 * 1024 ** 3), "12,4 Go");
  assert.equal(formatBytesFr(850 * 1024 ** 2), "850 Mo");
  assert.equal(formatAgoFr(new Date(NOW.getTime() - 30_000), NOW), "à l’instant");
  assert.equal(formatAgoFr(new Date(NOW.getTime() - 5 * 60_000), NOW), "il y a 5 min");
  assert.equal(formatAgoFr(new Date(NOW.getTime() - 2 * 3600_000), NOW), "il y a 2 h");
  assert.equal(formatAgoFr(new Date(NOW.getTime() - 3 * 86400_000), NOW), "il y a 3 j");
});

test("buildCordStatus fits Cord's limits", () => {
  const s = buildCordStatus(STATS, NOW);
  assert.equal(s.headline, "12,4 Go stockés");
  assert.equal(s.detail, "3 drives · dernier envoi il y a 2 h");
  assert.deepEqual(s.metrics, [
    { label: "Fichiers", value: "1 834" },
    { label: "Drives", value: "3" },
  ]);
  assert.equal(s.url, "https://drivecord.app/drive");

  const empty = buildCordStatus({ bytes: 0, files: 0, drives: 1, shares: 2, lastUploadAt: null }, NOW);
  assert.equal(empty.headline, "Aucun fichier pour l’instant");
  assert.equal(empty.detail, "1 drive");
  assert.equal(empty.metrics.length, 3);
  for (const m of empty.metrics) assert.ok(m.label.length <= 24 && m.value.length <= 24);
});

test("links must be HTTPS on a Drivecord host", () => {
  assert.ok(isAllowedCordUrl("https://drivecord.app/backup"));
  assert.ok(isAllowedCordUrl("https://www.drivecord.app/drive"));
  assert.ok(isAllowedCordUrl("https://drivecord.vercel.app/shares"));
  assert.ok(!isAllowedCordUrl("http://drivecord.app/drive"));
  assert.ok(!isAllowedCordUrl("https://evil.example/drive"));
  assert.ok(!isAllowedCordUrl("https://drivecord.app.evil.example/"));
  assert.ok(!isAllowedCordUrl("pas une url"));

  const n = normalizeNotification({ title: "x".repeat(200), body: "y".repeat(500), url: "https://evil.example" });
  assert.equal(n.title.length, 80);
  assert.equal(n.body!.length, 240);
  assert.equal(n.url, "https://drivecord.app/drive");
});

test("pushStatus posts the status with the client secret and sub", async () => {
  const h = harness();
  assert.equal(await h.sync.pushStatus("u1"), "ok");
  assert.equal(h.calls.length, 1);
  const [c] = h.calls;
  assert.equal(c.url, "https://compte.cordsuite.app/api/apps/status");
  assert.equal(c.method, "POST");
  assert.equal(c.body.client_id, "drivecord");
  assert.equal(c.body.client_secret, "s3cret");
  assert.equal(c.body.sub, "cord_abc");
  assert.equal((c.body.status as { headline: string }).headline, "12,4 Go stockés");
});

test("pushStatus is limited to once every 5 minutes per user", async () => {
  const h = harness();
  assert.equal(await h.sync.pushStatus("u1"), "ok");
  assert.equal(await h.sync.pushStatus("u1"), "throttled");
  assert.equal(await h.sync.pushStatus("u2"), "ok"); // per user
  h.advance(4 * 60);
  assert.equal(await h.sync.pushStatus("u1"), "throttled");
  h.advance(61);
  assert.equal(await h.sync.pushStatus("u1"), "ok");
  assert.equal(h.calls.length, 3);
});

test("no Cord account or no config → no HTTP call", async () => {
  const none = harness({ sub: null });
  assert.equal(await none.sync.pushStatus("u1"), "skipped");
  assert.equal(await none.sync.notify("u1", { title: "t", url: "https://drivecord.app/drive" }), "skipped");
  assert.equal(none.calls.length, 0);

  const off = harness({ config: false });
  assert.equal(await off.sync.pushStatus("u1"), "disabled");
  assert.equal(await off.sync.clearStatus("cord_abc"), "disabled");
  assert.equal(off.calls.length, 0);
});

test("not_connected is remembered and never retried", async () => {
  const h = harness({
    respond: () => new Response(JSON.stringify({ reason: "not_connected" }), { status: 404 }),
  });
  assert.equal(await h.sync.pushStatus("u1"), "not_connected");
  assert.ok(h.off.has("u1"));
  h.advance(10 * 60);
  assert.equal(await h.sync.pushStatus("u1"), "not_connected");
  assert.equal(await h.sync.notify("u1", { title: "t", url: "https://drivecord.app/drive" }), "not_connected");
  assert.equal(h.calls.length, 1);
  assert.equal(h.logs.length, 0); // expected answer, not an error
});

test("HTTP errors, timeouts and DB errors are logged, never thrown", async () => {
  const http = harness({ respond: () => new Response(JSON.stringify({ error: "quota" }), { status: 429 }) });
  assert.equal(await http.sync.pushStatus("u1"), "error");
  assert.equal(http.logs.length, 1);
  assert.ok(!http.off.has("u1"));

  const plain404 = harness({ respond: () => new Response("nope", { status: 404 }) });
  assert.equal(await plain404.sync.pushStatus("u1"), "error");
  assert.ok(!plain404.off.has("u1"));

  const net = harness({
    respond: () => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    },
  });
  assert.equal(await net.sync.pushStatus("u1"), "error");
  assert.match(net.logs[0], /échec réseau/);

  const broken = createCordSync({
    config: () => ({ issuer: "https://compte.cordsuite.app", clientId: "drivecord", clientSecret: "s" }),
    fetch: (() => Promise.reject(new Error("unreachable"))) as unknown as typeof fetch,
    now: () => NOW,
    getSub: () => Promise.reject(new Error("db down")),
    getStats: () => Promise.reject(new Error("db down")),
    acquire: async () => true,
    isDisconnected: async () => false,
    markDisconnected: async () => {},
    log: () => {},
  });
  assert.equal(await broken.pushStatus("u1"), "error");
  assert.equal(await broken.notify("u1", { title: "t", url: "https://drivecord.app" }), "error");
});

test("notify sends a clipped notification with a Drivecord link, within quotas", async () => {
  const h = harness();
  const r = await h.sync.notify(
    "u1",
    { title: "Sauvegarde terminée", body: "248 photos envoyées depuis ton iPhone", url: "https://drivecord.app/backup" },
    { kind: { key: "backup", limit: 2, windowSec: 3600 } },
  );
  assert.equal(r, "ok");
  const [c] = h.calls;
  assert.equal(c.url, "https://compte.cordsuite.app/api/apps/notify");
  assert.equal(c.body.sub, "cord_abc");
  assert.equal(c.body.title, "Sauvegarde terminée");
  assert.equal(c.body.url, "https://drivecord.app/backup");

  const n = { title: "t", url: "https://drivecord.app/backup" };
  const kind = { key: "backup", limit: 2, windowSec: 3600 };
  assert.equal(await h.sync.notify("u1", n, { kind }), "ok");
  assert.equal(await h.sync.notify("u1", n, { kind }), "throttled"); // per-kind limit

  // Global ceiling, below Cord's 30/h.
  // A call refused by its kind limit never reaches the global counter: 2 sent so far.
  let sent = 2;
  while (sent < NOTIFY_LIMIT_PER_HOUR) {
    assert.equal(await h.sync.notify("u1", n), "ok");
    sent++;
  }
  assert.equal(await h.sync.notify("u1", n), "throttled");
});

test("clearStatus deletes the tile status and treats not_connected as done", async () => {
  const h = harness();
  assert.equal(await h.sync.clearStatus("cord_abc"), "ok");
  assert.equal(h.calls[0].method, "DELETE");
  assert.equal(h.calls[0].url, "https://compte.cordsuite.app/api/apps/status");
  assert.deepEqual(h.calls[0].body, { client_id: "drivecord", client_secret: "s3cret", sub: "cord_abc" });

  const gone = harness({ respond: () => new Response(JSON.stringify({ reason: "not_connected" }), { status: 404 }) });
  assert.equal(await gone.sync.clearStatus("cord_abc"), "ok");
});
