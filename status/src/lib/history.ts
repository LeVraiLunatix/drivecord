import { codeOfStatus, median } from "./status-rules";
import type { DayRollup, DayTally, Sample } from "./types";

/** Longest gap that still counts as "the same outage" when measuring downtime between two samples. */
const MAX_GAP_MS = 15 * 60_000;
/** Duration credited to a lone sample (first of the day) when estimating downtime. */
const DEFAULT_INTERVAL_MS = 5 * 60_000;

export const dayKey = (t: number | Date): string => new Date(t).toISOString().slice(0, 10);

const MAJOR = codeOfStatus("major_outage");
const PARTIAL = codeOfStatus("partial_outage");

/** Tally one UTC day of samples, per component. Downtime = time covered by partial/major samples. */
export function buildRollup(samples: Sample[]): DayRollup {
  const sorted = [...samples].sort((a, b) => a.t - b.t);
  const out: DayRollup = {};
  sorted.forEach((s, i) => {
    const next = sorted[i + 1];
    const span = next ? Math.min(next.t - s.t, MAX_GAP_MS) : DEFAULT_INTERVAL_MS;
    for (const [id, entry] of Object.entries(s.c)) {
      const code = entry[0];
      const d: DayTally = (out[id] ??= { n: 0, s: [0, 0, 0, 0, 0, 0], dm: 0 });
      d.n += 1;
      if (code >= 0 && code < d.s.length) d.s[code]! += 1;
      if (code === MAJOR || code === PARTIAL) d.dm += span;
    }
  });
  return out;
}

/** The last `days` UTC days ending today, oldest first, as yyyy-mm-dd. */
export function lastDays(days: number, now: number): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i--) out.push(dayKey(now - i * 86_400_000));
  return out;
}

/** p50 of the successful-probe latencies of one component over the last 24 h. */
export function latencyP50(samples: Sample[], id: string, now: number): number | null {
  const since = now - 86_400_000;
  const values: number[] = [];
  for (const s of samples) {
    if (s.t < since) continue;
    const entry = s.c[id];
    if (entry && entry[1] >= 0) values.push(entry[1]);
  }
  return median(values);
}

export function mergeTallies(tallies: (DayTally | undefined)[]): DayTally {
  const out: DayTally = { n: 0, s: [0, 0, 0, 0, 0, 0], dm: 0 };
  for (const t of tallies) {
    if (!t) continue;
    out.n += t.n;
    out.dm += t.dm;
    t.s.forEach((v, i) => (out.s[i] = (out.s[i] ?? 0) + v));
  }
  return out;
}
