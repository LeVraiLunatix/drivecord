import { describe, expect, it } from "vitest";
import { buildRollup, dayKey, lastDays, latencyP50, mergeTallies } from "./history";
import { codeOfStatus } from "./status-rules";
import type { Sample, Status } from "./types";

const sample = (t: number, id: string, status: Status, ms = 100): Sample => ({ t, c: { [id]: [codeOfStatus(status), ms] } });
const MIN = 60_000;
const T0 = Date.UTC(2026, 9, 1, 12, 0, 0);

describe("buildRollup", () => {
  it("tallies samples per component and status", () => {
    const r = buildRollup([sample(T0, "a", "operational"), sample(T0 + 5 * MIN, "a", "degraded"), sample(T0 + 10 * MIN, "a", "operational")]);
    expect(r.a!.n).toBe(3);
    expect(r.a!.s).toEqual([2, 1, 0, 0, 0, 0]);
    expect(r.a!.dm).toBe(0);
  });

  it("measures downtime as the time covered by outage samples", () => {
    const r = buildRollup([
      sample(T0, "a", "operational"),
      sample(T0 + 5 * MIN, "a", "major_outage"),
      sample(T0 + 10 * MIN, "a", "partial_outage"),
      sample(T0 + 15 * MIN, "a", "operational"),
    ]);
    expect(r.a!.dm).toBe(10 * MIN);
  });

  it("caps a long gap so a missed cron is not counted as hours of outage, and credits the last sample one interval", () => {
    const r = buildRollup([sample(T0, "a", "major_outage"), sample(T0 + 3 * 60 * MIN, "a", "major_outage")]);
    expect(r.a!.dm).toBe(15 * MIN + 5 * MIN);
  });

  it("does not depend on input order", () => {
    const a = sample(T0, "a", "major_outage");
    const b = sample(T0 + 5 * MIN, "a", "operational");
    expect(buildRollup([b, a])).toEqual(buildRollup([a, b]));
  });
});

describe("days and latency", () => {
  it("lists the last N UTC days, oldest first", () => {
    expect(lastDays(3, T0)).toEqual(["2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(dayKey(T0)).toBe("2026-10-01");
  });

  it("computes the 24 h median from successful probes only", () => {
    const samples = [
      sample(T0 - 25 * 60 * MIN, "a", "operational", 9000), // older than 24 h: ignored
      sample(T0 - 3 * 60 * MIN, "a", "operational", 100),
      sample(T0 - 2 * 60 * MIN, "a", "operational", 300),
      sample(T0 - 1 * 60 * MIN, "a", "major_outage", -1), // no latency: ignored
      sample(T0, "a", "operational", 200),
    ];
    expect(latencyP50(samples, "a", T0)).toBe(200);
    expect(latencyP50(samples, "missing", T0)).toBeNull();
  });

  it("merges tallies", () => {
    expect(mergeTallies([{ n: 2, s: [2, 0, 0, 0, 0, 0], dm: 0 }, undefined, { n: 3, s: [1, 0, 1, 1, 0, 0], dm: 5 }])).toEqual({ n: 5, s: [3, 0, 1, 1, 0, 0], dm: 5 });
  });
});
