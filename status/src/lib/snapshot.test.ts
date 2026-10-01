import { describe, expect, it } from "vitest";
import { originsFromEnv } from "./components";
import { computeLatest, toSample } from "./cycle";
import { buildRollup, dayKey, lastDays } from "./history";
import { parseIncident } from "./incidents";
import type { CycleProbes } from "./probe";
import { CORS_HEADERS, serializeStatus, serializeSummary } from "./public-api";
import { buildSnapshot, getSnapshot } from "./snapshot";
import { MemoryStore } from "./store";
import type { DayRollup, Latest } from "./types";
import { activeComponents } from "./components";

const origins = originsFromEnv({});
const defs = activeComponents(origins);
const NOW = Date.UTC(2026, 10, 10, 12, 0, 0);
const MIN = 60_000;

const allOk = (over: CycleProbes["results"] = {}): CycleProbes => ({
  results: { ...Object.fromEntries(defs.map((d) => [d.id, { raw: "ok" as const, latencyMs: 100 }])), ...over },
  maintenanceMessage: null,
  networkOk: true,
});
const latestOf = (p: CycleProbes, at = NOW): Latest => computeLatest(defs, p, null, at);
const base = { origins, now: NOW, storage: "memory" as const, historyUnavailable: false, incidents: [], recent: [], daily: {} as Record<string, DayRollup> };

describe("buildSnapshot", () => {
  it("says history is still being built, instead of 100 %, when nothing was recorded yet", () => {
    const s = buildSnapshot({ ...base, latest: latestOf(allOk()) });
    expect(s.overall.status).toBe("operational");
    expect(s.uptimeOverall).toBeNull();
    expect(s.historyDays).toBe(0);
    for (const g of s.groups) for (const c of g.components) {
      expect(c.uptime).toBeNull();
      expect(c.days).toHaveLength(90);
      expect(c.days.every((d) => d.status === "nodata")).toBe(true);
    }
  });

  it("computes uptime, days and downtime from recorded samples", () => {
    const t = Date.UTC(2026, 10, 9, 8, 0, 0);
    let prev: Latest | null = null;
    const samples = [0, 1, 2, 3, 4, 5].map((i) => {
      prev = computeLatest(defs, allOk(i >= 2 ? { site: { raw: "fail", latencyMs: null } } : {}), prev, t + i * 5 * MIN);
      return toSample(prev);
    });
    const daily: Record<string, DayRollup> = { [dayKey(t)]: buildRollup(samples) };
    const s = buildSnapshot({ ...base, daily, latest: latestOf(allOk()) });
    const site = s.groups.flatMap((g) => g.components).find((c) => c.id === "site")!;
    // 2 ok + 1 degraded (first failure) count as up; 3 consecutive failures-so-far: partial, major, major count as down.
    expect(site.uptime).toBeCloseTo((3 / 6) * 100, 5);
    const day = site.days.find((d) => d.date === dayKey(t))!;
    expect(day.status).toBe("major_outage");
    expect(day.downMinutes).toBe(15);
    expect(day.samples).toBe(6);
    expect(s.historyDays).toBe(1);
  });

  it("only shows an uptime figure once enough samples exist", () => {
    const daily: Record<string, DayRollup> = { [dayKey(NOW)]: buildRollup([toSample(latestOf(allOk()))]) };
    const s = buildSnapshot({ ...base, daily, latest: latestOf(allOk()) });
    expect(s.groups[0]!.components[0]!.uptime).toBeNull();
    expect(s.uptimeOverall).toBeNull();
  });

  it("shows nothing as verified when there is no probe data at all", () => {
    const s = buildSnapshot({ ...base, latest: null });
    expect(s.checkedAt).toBeNull();
    expect(s.overall.status).toBe("unknown");
    expect(s.overall.text).toContain("Impossible de vérifier");
  });

  it("does not keep showing green when the last check is too old", () => {
    const s = buildSnapshot({ ...base, latest: latestOf(allOk(), NOW - 30 * MIN) });
    expect(s.overall.status).toBe("unknown");
  });

  it("lets an active incident force a component's status, and lists upcoming maintenance separately", () => {
    const incident = parseIncident("i", `---\ntitle: Panne\nstatus: investigating\nseverity: major_outage\ncomponents: [upload]\nstartedAt: 2026-11-10T11:00:00Z\n---\n`)!;
    const maintenance = parseIncident("m", `---\ntitle: Maintenance\nstatus: investigating\nseverity: maintenance\nstartedAt: 2026-11-12T10:00:00Z\nendsAt: 2026-11-12T11:00:00Z\n---\n`)!;
    const s = buildSnapshot({ ...base, latest: latestOf(allOk()), incidents: [incident, maintenance] });
    const upload = s.groups.flatMap((g) => g.components).find((c) => c.id === "upload")!;
    expect(upload.status).toBe("major_outage");
    expect(upload.fromIncident).toBe(true);
    expect(s.overall.status).toBe("major_outage");
    expect(s.activeIncidents.map((i) => i.slug)).toEqual(["i"]);
    expect(s.upcomingMaintenances.map((i) => i.slug)).toEqual(["m"]);
  });

  it("surfaces the operators' maintenance message", () => {
    const s = buildSnapshot({ ...base, latest: computeLatest(defs, { ...allOk(), maintenanceMessage: "Maintenance 22h–23h." }, null, NOW) });
    expect(s.maintenanceMessage).toBe("Maintenance 22h–23h.");
  });

  it("groups only contain components that exist for this configuration", () => {
    const s = buildSnapshot({ ...base, latest: latestOf(allOk()) });
    expect(s.groups.flatMap((g) => g.components).some((c) => c.id === "usercontent")).toBe(false);
    expect(lastDays(90, NOW)).toHaveLength(90);
  });
});

describe("getSnapshot", () => {
  it("probes by itself when there is no recent data, then serves it from the store", async () => {
    const store = new MemoryStore();
    const fetched: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL) => {
      fetched.push(String(url));
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    try {
      const s = await getSnapshot({ store, origins, now: Date.now(), incidents: [] });
      expect(fetched.length).toBeGreaterThan(10);
      expect(s.checkedAt).not.toBeNull();
      expect(await store.getLatest()).not.toBeNull();
      const before = fetched.length;
      await getSnapshot({ store, origins, now: Date.now() + 1000, incidents: [] });
      expect(fetched.length).toBe(before); // fresh enough: no new probes
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  it("does not probe when told not to (build time)", async () => {
    const store = new MemoryStore();
    const s = await getSnapshot({ store, origins, now: NOW, incidents: [], refresh: false });
    expect(s.checkedAt).toBeNull();
    expect(s.overall.status).toBe("unknown");
  });

  it("keeps serving live status when the history store is unreadable", async () => {
    const store = new MemoryStore();
    store.getLatest = async () => {
      throw new Error("down");
    };
    const s = await getSnapshot({ store, origins, now: NOW, incidents: [], refresh: false });
    expect(s.historyUnavailable).toBe(true);
  });
});

describe("public JSON", () => {
  const snap = buildSnapshot({ ...base, latest: latestOf(allOk({ site: { raw: "fail", latencyMs: null } })) });

  it("serialises the summary with a Statuspage-style indicator", () => {
    const s = serializeSummary(snap, "https://status.example");
    expect(s.status).toMatchObject({ indicator: "minor", status: "degraded" });
    expect(s.page.updatedAt).toBe(new Date(NOW).toISOString());
    expect(s.maintenance).toBeNull();
  });

  it("serialises every component without internal details", () => {
    const j = serializeStatus(snap, "https://status.example");
    expect(j.components.length).toBe(defs.length);
    expect(j.components[0]).toEqual(expect.objectContaining({ id: expect.any(String), status: expect.any(String), uptime90d: null }));
    const text = JSON.stringify(j);
    expect(text).not.toMatch(/fails|probe|detail/);
  });

  it("is readable cross-origin and cacheable", () => {
    expect(CORS_HEADERS["Access-Control-Allow-Origin"]).toBe("*");
    expect(CORS_HEADERS["Access-Control-Allow-Methods"]).toBe("GET, OPTIONS");
    expect(CORS_HEADERS["Cache-Control"]).toContain("s-maxage");
  });
});
