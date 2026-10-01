import { describe, expect, it } from "vitest";
import { dayStatus, evaluate, median, summarize, uptimePercent, withDependencies, worst, type EvalContext } from "./status-rules";
import type { ComponentState } from "./types";

const ctx: EvalContext = { slowMs: 2000, isDb: false, dbDown: false, needsDb: false };
const ok = (latencyMs: number) => ({ id: "x", raw: "ok" as const, latencyMs });
const fail = { id: "x", raw: "fail" as const, latencyMs: null };

describe("evaluate", () => {
  it("is operational on a fast answer", () => {
    expect(evaluate(undefined, ok(120), ctx)).toEqual({ status: "operational", latencyMs: 120, fails: 0 });
  });

  it("is degraded when slower than the threshold", () => {
    expect(evaluate(undefined, ok(2500), ctx).status).toBe("degraded");
    expect(evaluate(undefined, ok(2000), ctx).status).toBe("operational");
    expect(evaluate(undefined, ok(100), { ...ctx, slowMs: 50 }).status).toBe("degraded");
  });

  it("is degraded after one isolated failure, partial after two, major after three or more", () => {
    let s: ComponentState | undefined;
    s = evaluate(s, fail, ctx);
    expect([s.status, s.fails]).toEqual(["degraded", 1]);
    s = evaluate(s, fail, ctx);
    expect([s.status, s.fails]).toEqual(["partial_outage", 2]);
    s = evaluate(s, fail, ctx);
    expect([s.status, s.fails]).toEqual(["major_outage", 3]);
    s = evaluate(s, fail, ctx);
    expect([s.status, s.fails]).toEqual(["major_outage", 4]);
  });

  it("resets the failure counter on success", () => {
    const failing = evaluate(evaluate(undefined, fail, ctx), fail, ctx);
    expect(evaluate(failing, ok(100), ctx)).toEqual({ status: "operational", latencyMs: 100, fails: 0 });
  });

  it("makes the database a major outage at once", () => {
    expect(evaluate(undefined, fail, { ...ctx, isDb: true }).status).toBe("major_outage");
  });

  it("makes a DB-backed component fail hard only while the database is down", () => {
    expect(evaluate(undefined, fail, { ...ctx, needsDb: true, dbDown: true }).status).toBe("major_outage");
    expect(evaluate(undefined, fail, { ...ctx, needsDb: true, dbDown: false }).status).toBe("degraded");
    expect(evaluate(undefined, fail, { ...ctx, needsDb: false, dbDown: true }).status).toBe("degraded");
  });

  it("keeps the counter on unknown and clears it on maintenance", () => {
    const failing = evaluate(undefined, fail, ctx);
    expect(evaluate(failing, { id: "x", raw: "unknown", latencyMs: null }, ctx)).toMatchObject({ status: "unknown", fails: 1 });
    expect(evaluate(failing, { id: "x", raw: "maintenance", latencyMs: null }, ctx)).toMatchObject({ status: "maintenance", fails: 0 });
  });
});

describe("withDependencies", () => {
  it("never reports better than a failing dependency", () => {
    expect(withDependencies("operational", ["major_outage"])).toBe("major_outage");
    expect(withDependencies("operational", ["degraded", "partial_outage"])).toBe("partial_outage");
    expect(withDependencies("major_outage", ["degraded"])).toBe("major_outage");
  });
  it("ignores unknown and maintenance dependencies", () => {
    expect(withDependencies("operational", ["unknown", "maintenance"])).toBe("operational");
  });
});

describe("worst / summarize", () => {
  it("orders by severity and never lets unknown hide a problem", () => {
    expect(worst(["operational", "unknown", "degraded"])).toBe("degraded");
    expect(worst(["operational", "unknown"])).toBe("unknown");
    expect(worst([])).toBe("unknown");
  });

  it("says all is fine only when everything is verified and operational", () => {
    expect(summarize(["operational", "operational"])).toEqual({ status: "operational", text: "Tous les systèmes sont opérationnels." });
    expect(summarize(["operational", "unknown"]).text).toBe("Tous les systèmes vérifiés sont opérationnels.");
  });

  it("reports the worst situation, singular or plural", () => {
    expect(summarize(["operational", "major_outage"])).toMatchObject({ status: "major_outage", text: "Un système est en panne majeure." });
    expect(summarize(["degraded", "degraded"]).text).toBe("Plusieurs systèmes sont dégradés.");
    expect(summarize(["partial_outage", "degraded"]).status).toBe("partial_outage");
    expect(summarize(["maintenance", "operational"]).status).toBe("maintenance");
  });

  it("admits it cannot verify rather than claiming operational", () => {
    expect(summarize([]).status).toBe("unknown");
    expect(summarize(["unknown", "unknown"]).text).toContain("Impossible de vérifier");
  });
});

describe("uptime", () => {
  it("counts operational+degraded as up and partial/major as down, ignoring maintenance and unknown", () => {
    const day = { n: 100, s: [90, 5, 3, 2, 0, 0], dm: 0 };
    expect(uptimePercent([day]).percent).toBeCloseTo(95, 5);
    expect(uptimePercent([{ n: 10, s: [0, 0, 0, 0, 5, 5], dm: 0 }]).percent).toBeNull();
    expect(uptimePercent([]).percent).toBeNull();
  });
  it("colours a day by its worst sample", () => {
    expect(dayStatus(undefined)).toBe("nodata");
    expect(dayStatus({ n: 0, s: [0, 0, 0, 0, 0, 0], dm: 0 })).toBe("nodata");
    expect(dayStatus({ n: 3, s: [3, 0, 0, 0, 0, 0], dm: 0 })).toBe("operational");
    expect(dayStatus({ n: 3, s: [2, 1, 0, 0, 0, 0], dm: 0 })).toBe("degraded");
    expect(dayStatus({ n: 3, s: [1, 1, 1, 0, 0, 0], dm: 0 })).toBe("partial_outage");
    expect(dayStatus({ n: 3, s: [1, 1, 1, 1, 0, 0], dm: 0 })).toBe("major_outage");
    expect(dayStatus({ n: 2, s: [0, 0, 0, 0, 2, 0], dm: 0 })).toBe("maintenance");
  });
  it("computes a median", () => {
    expect(median([])).toBeNull();
    expect(median([5])).toBe(5);
    expect(median([9, 1, 5])).toBe(5);
    expect(median([1, 2, 3, 4])).toBe(3);
  });
});
