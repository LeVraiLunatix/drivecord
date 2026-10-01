import { describe, expect, it } from "vitest";
import { applyMaintenance, buildPayload, COMPONENT_IDS, measure, parseMaintenance, SLOW_MS, withTimeout, type ComponentHealth } from "./health-core";

const list: ComponentHealth[] = COMPONENT_IDS.map((id) => ({ id, status: "operational", latencyMs: 12 }));

describe("parseMaintenance", () => {
  it("is inactive without a message", () => {
    expect(parseMaintenance(undefined, undefined).message).toBeNull();
    expect(parseMaintenance("   ", "db").message).toBeNull();
  });
  it("concerns every component by default or with `all`", () => {
    expect([...parseMaintenance("Maintenance", undefined).components].sort()).toEqual([...COMPONENT_IDS].sort());
    expect(parseMaintenance("Maintenance", "all").components.size).toBe(COMPONENT_IDS.length);
  });
  it("narrows to the listed known components, ignoring typos and case", () => {
    const m = parseMaintenance("Maintenance", " DB, email ,nope");
    expect([...m.components].sort()).toEqual(["db", "email"]);
  });
  it("truncates the public message to 300 characters", () => {
    expect(parseMaintenance("x".repeat(500), undefined).message).toHaveLength(300);
  });
});

describe("applyMaintenance / buildPayload", () => {
  it("leaves components alone when no maintenance is announced", () => {
    const p = buildPayload(list, parseMaintenance(undefined, undefined));
    expect(p.maintenance).toBeNull();
    expect(p.components).toEqual(list);
  });
  it("puts the concerned components in maintenance and exposes the message", () => {
    const p = buildPayload(list, parseMaintenance("Ce soir 22h.", "email,push"));
    expect(p.maintenance).toEqual({ message: "Ce soir 22h." });
    expect(p.components.filter((c) => c.status === "maintenance").map((c) => c.id)).toEqual(["email", "push"]);
    expect(p.components.find((c) => c.id === "db")!.status).toBe("operational");
    expect(p.components.find((c) => c.id === "email")!.latencyMs).toBeNull();
  });
  it("does not mutate its input", () => {
    const copy = JSON.parse(JSON.stringify(list));
    applyMaintenance(list, parseMaintenance("m", "all"));
    expect(list).toEqual(copy);
  });
  it("only ever exposes id, status and latency", () => {
    const p = buildPayload(list, parseMaintenance("m", undefined));
    for (const c of p.components) expect(Object.keys(c).sort()).toEqual(["id", "latencyMs", "status"]);
  });
});

describe("measure", () => {
  it("is operational when the check succeeds quickly", async () => {
    const r = await measure(async () => 1, 1000);
    expect(r.status).toBe("operational");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });
  it("is down when the check throws or times out, without leaking the error", async () => {
    expect(await measure(async () => Promise.reject(new Error("secret host db.internal:5432")), 1000)).toEqual({ status: "down", latencyMs: null });
    expect(await measure(() => new Promise(() => {}), 20)).toEqual({ status: "down", latencyMs: null });
  });
  it("is degraded when slower than the threshold", async () => {
    const r = await measure(() => new Promise((res) => setTimeout(res, 30)), 1000);
    expect(r.status).toBe("operational"); // 30 ms is far below SLOW_MS
    expect(SLOW_MS).toBe(2000);
  });
});

describe("withTimeout", () => {
  it("resolves, rejects and times out", async () => {
    await expect(withTimeout(Promise.resolve(1), 50)).resolves.toBe(1);
    await expect(withTimeout(Promise.reject(new Error("x")), 50)).rejects.toThrow("x");
    await expect(withTimeout(new Promise(() => {}), 10)).rejects.toThrow("timeout");
  });
});
