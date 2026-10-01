import { activeComponents, originsFromEnv, type ComponentDef, type Origins } from "./components";
import { buildRollup, dayKey } from "./history";
import { DEFAULT_SLOW_MS, probeAll, type CycleProbes } from "./probe";
import { codeOfStatus, evaluate, withDependencies } from "./status-rules";
import { HISTORY_DAYS, type Store } from "./store";
import type { ComponentState, Latest, Sample } from "./types";

/** Two cycles closer than this are the same cycle (cron + a visitor-triggered refresh racing). */
const MIN_CYCLE_GAP_MS = 45_000;

/**
 * Turns raw probe results into the next `Latest`, applying the evaluation rules and the `needs`
 * dependencies. Pure — the whole decision logic is unit-tested through here.
 */
export function computeLatest(defs: ComponentDef[], probes: CycleProbes, prev: Latest | null, now: number): Latest {
  const own: Record<string, ComponentState> = {};
  const byId = new Map(defs.map((d) => [d.id, d]));

  // Database first: DB-backed components fail "hard" while it is in a major outage.
  const dbDef = defs.find((d) => d.isDb);
  let dbDown = false;
  if (dbDef) {
    const r = probes.results[dbDef.id];
    own[dbDef.id] = evaluate(prev?.components[dbDef.id], { id: dbDef.id, raw: r?.raw ?? "unknown", latencyMs: r?.latencyMs ?? null }, { slowMs: DEFAULT_SLOW_MS, isDb: true, dbDown: false, needsDb: false });
    dbDown = own[dbDef.id]!.status === "major_outage";
  }

  for (const d of defs) {
    if (own[d.id]) continue;
    const r = probes.results[d.id];
    const slowMs = d.probe.kind === "http" ? d.probe.slowMs ?? DEFAULT_SLOW_MS : DEFAULT_SLOW_MS;
    own[d.id] = evaluate(prev?.components[d.id], { id: d.id, raw: r?.raw ?? "unknown", latencyMs: r?.latencyMs ?? null }, { slowMs, isDb: false, dbDown, needsDb: Boolean(d.dependsOnDb) });
  }

  const components: Record<string, ComponentState> = {};
  for (const d of defs) {
    const state = own[d.id]!;
    const deps = (d.needs ?? []).filter((n) => byId.has(n)).map((n) => own[n]!.status);
    components[d.id] = { ...state, status: withDependencies(state.status, deps) };
  }
  return { at: now, components, maintenanceMessage: probes.maintenanceMessage };
}

export function toSample(latest: Latest): Sample {
  const c: Sample["c"] = {};
  for (const [id, s] of Object.entries(latest.components)) c[id] = [codeOfStatus(s.status), s.latencyMs ?? -1];
  return { t: latest.at, c };
}

export type CycleResult = { latest: Latest | null; ran: boolean; stored: boolean };

type CycleDeps = { store: Store; origins?: Origins; now?: () => number; probe?: (o: Origins) => Promise<CycleProbes> };

let inflight: Promise<CycleResult> | null = null;

/**
 * One probe cycle: probe everything, evaluate, persist the sample and refresh today's rollup.
 * Concurrent callers in the same instance share one run.
 */
export function runCycle(deps: CycleDeps, opts: { force?: boolean } = {}): Promise<CycleResult> {
  inflight ??= doCycle(deps, opts).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doCycle({ store, origins = originsFromEnv(), now = Date.now, probe = probeAll }: CycleDeps, opts: { force?: boolean }): Promise<CycleResult> {
  let prev: Latest | null = null;
  let storeUp = true;
  try {
    prev = await store.getLatest();
  } catch {
    storeUp = false;
  }
  const t = now();
  if (!opts.force && prev && t - prev.at < MIN_CYCLE_GAP_MS) return { latest: prev, ran: false, stored: true };

  const defs = activeComponents(origins);
  const probes = await probe(origins);
  // No network on our side at all: say nothing rather than record a fake total outage.
  if (!probes.networkOk) return { latest: prev, ran: true, stored: false };

  const latest = computeLatest(defs, probes, prev, t);
  if (!storeUp) return { latest, ran: true, stored: false };
  try {
    const day = dayKey(t);
    await store.setLatest(latest);
    await store.appendSample(day, toSample(latest));
    await store.setDaily(day, buildRollup(await store.getSamples(day)), HISTORY_DAYS);
    return { latest, ran: true, stored: true };
  } catch (e) {
    console.error("[status] store write failed", e instanceof Error ? e.message : e);
    return { latest, ran: true, stored: false };
  }
}
