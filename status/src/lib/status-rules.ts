import { STATUS_CODES, type ComponentState, type DayTally, type Observation, type Status } from "./types";

/** Severity order: higher = worse. `unknown` ranks low so it never hides a real problem. */
const RANK: Record<Status, number> = {
  operational: 0,
  unknown: 1,
  maintenance: 2,
  degraded: 3,
  partial_outage: 4,
  major_outage: 5,
};

export const rank = (s: Status): number => RANK[s];

export function worst(statuses: Status[]): Status {
  if (!statuses.length) return "unknown";
  let w: Status = "operational";
  for (const s of statuses) if (RANK[s] > RANK[w]) w = s;
  return w;
}

/** Worst of the verified statuses; "unknown" only when nothing could be verified. */
export function worstKnown(statuses: Status[]): Status {
  const known = statuses.filter((s) => s !== "unknown");
  return known.length ? worst(known) : "unknown";
}

export const statusFromCode = (code: number): Status => STATUS_CODES[code] ?? "unknown";
export const codeOfStatus = (s: Status): number => STATUS_CODES.indexOf(s);

export type EvalContext = {
  /** Latency above which an answer counts as degraded. */
  slowMs: number;
  /** This component IS the database: any failure is a major outage. */
  isDb: boolean;
  /** The database is currently in a major outage. */
  dbDown: boolean;
  /** This component needs the database to work. */
  needsDb: boolean;
};

/**
 * The rules turning raw probe results into a status:
 * - one isolated failure, or an answer slower than the threshold → degraded
 * - 2 consecutive failures → partial outage
 * - 3 or more consecutive failures → major outage
 * - the database failing (or a DB-backed component failing while it is down) → major outage at once
 * - unknown / maintenance never move the failure counter.
 */
export function evaluate(prev: ComponentState | undefined, obs: Observation, ctx: EvalContext): ComponentState {
  const prevFails = prev?.fails ?? 0;
  switch (obs.raw) {
    case "ok":
      return {
        status: obs.latencyMs !== null && obs.latencyMs > ctx.slowMs ? "degraded" : "operational",
        latencyMs: obs.latencyMs,
        fails: 0,
      };
    case "slow":
      return { status: "degraded", latencyMs: obs.latencyMs, fails: 0 };
    case "fail": {
      const fails = prevFails + 1;
      let status: Status = fails >= 3 ? "major_outage" : fails === 2 ? "partial_outage" : "degraded";
      if (ctx.isDb || (ctx.dbDown && ctx.needsDb)) status = "major_outage";
      return { status, latencyMs: null, fails };
    }
    case "maintenance":
      return { status: "maintenance", latencyMs: obs.latencyMs, fails: 0 };
    default:
      return { status: "unknown", latencyMs: prev?.latencyMs ?? null, fails: prevFails };
  }
}

/**
 * A component that `needs` others is never reported better than them (uploads can't be "operational"
 * while Discord is down). `unknown` and `maintenance` of a dependency don't propagate.
 */
export function withDependencies(own: Status, deps: Status[]): Status {
  let out = own;
  for (const d of deps) if (RANK[d] >= RANK.degraded && RANK[d] > RANK[out]) out = d;
  return out;
}

export type Banner = { status: Status; text: string };

export function summarize(statuses: Status[]): Banner {
  const unverifiable = { status: "unknown" as const, text: "Impossible de vérifier l'état des systèmes pour le moment." };
  if (!statuses.length || statuses.every((s) => s === "unknown")) return unverifiable;
  const w = worstKnown(statuses);
  const many = statuses.filter((s) => s === w).length > 1;
  switch (w) {
    case "major_outage":
      return { status: w, text: many ? "Plusieurs systèmes sont en panne majeure." : "Un système est en panne majeure." };
    case "partial_outage":
      return { status: w, text: many ? "Plusieurs systèmes subissent une panne partielle." : "Un système subit une panne partielle." };
    case "degraded":
      return { status: w, text: many ? "Plusieurs systèmes sont dégradés." : "Un système est dégradé." };
    case "maintenance":
      return { status: w, text: "Une maintenance est en cours." };
    case "unknown":
      return unverifiable;
    default:
      return statuses.includes("unknown")
        ? { status: "operational", text: "Tous les systèmes vérifiés sont opérationnels." }
        : { status: "operational", text: "Tous les systèmes sont opérationnels." };
  }
}

/** Uptime over a window of rollups: operational+degraded count as up, partial/major as down. */
export function uptimePercent(days: DayTally[]): { percent: number | null; samples: number } {
  let up = 0;
  let down = 0;
  let samples = 0;
  for (const d of days) {
    up += (d.s[0] ?? 0) + (d.s[1] ?? 0);
    down += (d.s[2] ?? 0) + (d.s[3] ?? 0);
    samples += d.n;
  }
  const denom = up + down;
  return { percent: denom === 0 ? null : (up / denom) * 100, samples };
}

/** Colour class of one day in the 90-day bar. */
export function dayStatus(d: DayTally | undefined): Status | "nodata" {
  if (!d || d.n === 0) return "nodata";
  if ((d.s[3] ?? 0) > 0) return "major_outage";
  if ((d.s[2] ?? 0) > 0) return "partial_outage";
  if ((d.s[1] ?? 0) > 0) return "degraded";
  if ((d.s[0] ?? 0) > 0) return "operational";
  if ((d.s[4] ?? 0) > 0) return "maintenance";
  return "unknown";
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const v = [...values].sort((a, b) => a - b);
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid]! : Math.round((v[mid - 1]! + v[mid]!) / 2);
}
