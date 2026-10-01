import { beforeEach, describe, expect, it } from "vitest";
import { activeComponents, originsFromEnv } from "./components";
import { computeLatest, runCycle, toSample } from "./cycle";
import type { CycleProbes, ProbeResult } from "./probe";
import { MemoryStore } from "./store";
import type { Latest } from "./types";

const origins = originsFromEnv({ USERCONTENT_ORIGIN: "https://files.example" });
const defs = activeComponents(origins);
const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);

function probes(overrides: Record<string, ProbeResult> = {}, extra: Partial<CycleProbes> = {}): CycleProbes {
  const results: Record<string, ProbeResult> = {};
  for (const d of defs) results[d.id] = { raw: "ok", latencyMs: 120 };
  return { results: { ...results, ...overrides }, maintenanceMessage: null, networkOk: true, ...extra };
}
const fail: ProbeResult = { raw: "fail", latencyMs: null };

describe("computeLatest", () => {
  it("marks everything operational when every probe is fine", () => {
    const l = computeLatest(defs, probes(), null, NOW);
    expect(Object.values(l.components).every((c) => c.status === "operational")).toBe(true);
    expect(Object.keys(l.components).sort()).toEqual(defs.map((d) => d.id).sort());
  });

  it("escalates a failing component over consecutive cycles: degraded, partial, major", () => {
    let l: Latest | null = null;
    const seen: string[] = [];
    for (let i = 0; i < 4; i++) {
      l = computeLatest(defs, probes({ "api-v2": fail }), l, NOW + i * 60_000);
      seen.push(l.components["api-v2"]!.status);
    }
    expect(seen).toEqual(["degraded", "partial_outage", "major_outage", "major_outage"]);
  });

  it("puts the database and everything depending on it in major outage at once when the database is down", () => {
    const l = computeLatest(defs, probes({ db: fail, "api-v2": fail, docs: fail }), null, NOW);
    expect(l.components.db!.status).toBe("major_outage");
    expect(l.components["api-v2"]!.status).toBe("major_outage"); // depends on the DB
    expect(l.components.docs!.status).toBe("degraded"); // static docs do not
  });

  it("propagates failing dependencies: uploads are down while Discord is", () => {
    const l = computeLatest(defs, probes({ discord: fail, "discord-cdn": fail }), null, NOW);
    expect(l.components.discord!.status).toBe("degraded");
    expect(l.components.upload!.status).toBe("degraded");
    expect(l.components.download!.status).toBe("degraded");
    // A component that does not need Discord is untouched.
    expect(l.components.docs!.status).toBe("operational");
  });

  it("reports slow answers as degraded using the per-probe threshold", () => {
    const l = computeLatest(defs, probes({ site: { raw: "ok", latencyMs: 2600 }, "share-page": { raw: "ok", latencyMs: 2600 } }), null, NOW);
    expect(l.components.site!.status).toBe("degraded");
    expect(l.components["share-page"]!.status).toBe("operational"); // slowMs 3500
  });

  it("keeps unverifiable components unknown and carries the maintenance message", () => {
    const l = computeLatest(defs, probes({ push: { raw: "unknown", latencyMs: null } }, { maintenanceMessage: "Maintenance 22h." }), null, NOW);
    expect(l.components.push!.status).toBe("unknown");
    expect(l.maintenanceMessage).toBe("Maintenance 22h.");
  });

  it("serialises to a compact sample", () => {
    const s = toSample(computeLatest(defs, probes({ site: fail }), null, NOW));
    expect(s.t).toBe(NOW);
    expect(s.c.site).toEqual([1, -1]); // degraded, no latency
    expect(s.c.docs).toEqual([0, 120]);
  });
});

describe("runCycle", () => {
  let store: MemoryStore;
  beforeEach(() => {
    store = new MemoryStore();
  });
  const run = (p: CycleProbes, now: number, force = false) => runCycle({ store, origins, now: () => now, probe: async () => p }, { force });

  it("stores latest, appends a sample and refreshes today's rollup", async () => {
    const r = await run(probes(), NOW);
    expect(r).toMatchObject({ ran: true, stored: true });
    expect((await store.getLatest())!.at).toBe(NOW);
    expect(await store.getSamples("2026-11-01")).toHaveLength(1);
    expect((await store.getDaily())["2026-11-01"]!.site!.n).toBe(1);
  });

  it("does not run twice in quick succession (cron + a visitor refresh), unless forced", async () => {
    await run(probes(), NOW);
    expect((await run(probes(), NOW + 10_000)).ran).toBe(false);
    expect((await run(probes(), NOW + 10_000, true)).ran).toBe(true);
    expect((await run(probes(), NOW + 60_000)).ran).toBe(true);
    expect((await store.getSamples("2026-11-01")).length).toBe(3);
  });

  it("carries the failure counter from one cycle to the next", async () => {
    await run(probes({ shares: fail }), NOW);
    await run(probes({ shares: fail }), NOW + 60_000);
    expect((await store.getLatest())!.components.shares!.status).toBe("partial_outage");
  });

  it("records nothing when this service itself has no network (no fake total outage)", async () => {
    const r = await run(probes({}, { networkOk: false }), NOW);
    expect(r).toMatchObject({ ran: true, stored: false });
    expect(await store.getLatest()).toBeNull();
    expect(await store.getSamples("2026-11-01")).toEqual([]);
  });

  it("still returns the live result when the store is down", async () => {
    const broken = new MemoryStore();
    broken.getLatest = async () => {
      throw new Error("down");
    };
    const r = await runCycle({ store: broken, origins, now: () => NOW, probe: async () => probes() }, { force: true });
    expect(r.latest).not.toBeNull();
    expect(r.stored).toBe(false);
  });
});

describe("inventory", () => {
  it("covers every area the page promises, with unique ids", () => {
    const ids = defs.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ["site", "docs", "drive", "share-page", "usercontent", "admin", "login", "passkeys", "two-factor", "e2ee-keys", "device-approval", "vault", "db", "discord", "discord-cdn", "upload", "download", "shares", "api-v2", "api-v1", "oauth-metadata", "oauth-token", "embed", "openapi", "email", "push", "patreon", "hub", "desktop-updates", "ios-updates"]) {
      expect(ids, id).toContain(id);
    }
  });

  it("hides the public-files component when no content origin is configured", () => {
    expect(activeComponents(originsFromEnv({})).some((d) => d.id === "usercontent")).toBe(false);
  });

  it("only references components that exist in `needs`", () => {
    const ids = new Set(defs.map((d) => d.id));
    for (const d of defs) for (const n of d.needs ?? []) expect(ids.has(n), `${d.id} needs ${n}`).toBe(true);
  });
});
