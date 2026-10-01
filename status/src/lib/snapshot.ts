import { activeComponents, GROUPS, originsFromEnv, type Origins } from "./components";
import { runCycle } from "./cycle";
import { dayKey, lastDays, latencyP50, mergeTallies } from "./history";
import { forcedStatus, isActive, isUpcoming, loadIncidents } from "./incidents";
import { dayStatus, rank, summarize, uptimePercent, worstKnown, type Banner } from "./status-rules";
import { HISTORY_DAYS, storeFromEnv, type Store } from "./store";
import type { DayRollup, DayTally, GroupId, Incident, Latest, Sample, Status } from "./types";

/** A visit older than this triggers a refresh itself, so the page stays live even without a scheduler. */
const REFRESH_AFTER_MS = Number(process.env.STATUS_REFRESH_AFTER_SEC ?? 240) * 1000;
const STALE_AFTER_MS = 15 * 60_000;
/** Below this many samples, no uptime figure is shown for a component (history still being built). */
export const MIN_SAMPLES_FOR_UPTIME = 3;

export type DayView = { date: string; status: Status | "nodata"; uptime: number | null; downMinutes: number; samples: number };

export type ComponentView = {
  id: string;
  name: string;
  description: string;
  status: Status;
  /** True when an incident file (not a probe) decides the displayed status. */
  fromIncident: boolean;
  latencyMs: number | null;
  p50Ms: number | null;
  uptime: number | null;
  uptimeSamples: number;
  days: DayView[];
};

export type GroupView = { id: GroupId; name: string; status: Status; components: ComponentView[] };

export type Snapshot = {
  /** Epoch ms the snapshot was built at (for relative times). */
  now: number;
  /** ISO time of the probe cycle the data comes from; null when nothing could be established. */
  checkedAt: string | null;
  overall: Banner;
  maintenanceMessage: string | null;
  groups: GroupView[];
  uptimeOverall: number | null;
  /** Number of UTC days (≤ 90) that have at least one sample. */
  historyDays: number;
  storage: Store["kind"];
  /** The history store could not be read: live status is still shown, bars are not. */
  historyUnavailable: boolean;
  activeIncidents: Incident[];
  upcomingMaintenances: Incident[];
};

type Deps = { store?: Store; origins?: Origins; now?: number; incidents?: Incident[]; refresh?: boolean };

/** Builds everything the page, the JSON API and the RSS feed render. */
export async function getSnapshot(deps: Deps = {}): Promise<Snapshot> {
  const store = deps.store ?? storeFromEnv();
  const origins = deps.origins ?? originsFromEnv();
  const now = deps.now ?? Date.now();
  const incidents = deps.incidents ?? loadIncidents();

  let latest: Latest | null = null;
  let historyUnavailable = false;
  try {
    latest = await store.getLatest();
  } catch {
    historyUnavailable = true;
  }
  if ((deps.refresh ?? true) && (!latest || now - latest.at > REFRESH_AFTER_MS)) {
    const r = await runCycle({ store, origins }).catch(() => null);
    if (r?.latest) latest = r.latest;
    if (r && !r.stored) historyUnavailable = historyUnavailable || r.latest !== null;
  }

  let daily: Record<string, DayRollup> = {};
  let recent: Sample[] = [];
  if (!historyUnavailable) {
    try {
      const [d, today, yesterday] = await Promise.all([store.getDaily(), store.getSamples(dayKey(now)), store.getSamples(dayKey(now - 86_400_000))]);
      daily = d;
      recent = [...yesterday, ...today];
    } catch {
      historyUnavailable = true;
    }
  }
  return buildSnapshot({ latest, daily, recent, incidents, origins, now, storage: store.kind, historyUnavailable });
}

export function buildSnapshot(a: {
  latest: Latest | null;
  daily: Record<string, DayRollup>;
  recent: Sample[];
  incidents: Incident[];
  origins: Origins;
  now: number;
  storage: Store["kind"];
  historyUnavailable: boolean;
}): Snapshot {
  const days = lastDays(HISTORY_DAYS, a.now);
  const defs = activeComponents(a.origins);
  // A last check that old no longer says anything about now: show "not verified", never a stale green.
  const stale = a.latest !== null && a.now - a.latest.at > STALE_AFTER_MS;
  const withData = new Set<string>();

  const groups: GroupView[] = GROUPS.map((g) => {
    const components = defs
      .filter((d) => d.group === g.id)
      .map((d): ComponentView => {
        const probed: Status = stale ? "unknown" : a.latest?.components[d.id]?.status ?? "unknown";
        const forced = forcedStatus(a.incidents, d.id, a.now);
        const status = forced && rank(forced) > rank(probed) ? forced : probed;
        const fromIncident = status !== probed;
        const dayViews: DayView[] = days.map((date) => {
          const t: DayTally | undefined = a.daily[date]?.[d.id];
          if (t && t.n > 0) withData.add(date);
          const up = t ? (t.s[0] ?? 0) + (t.s[1] ?? 0) : 0;
          const down = t ? (t.s[2] ?? 0) + (t.s[3] ?? 0) : 0;
          return { date, status: dayStatus(t), uptime: up + down > 0 ? (up / (up + down)) * 100 : null, downMinutes: Math.round((t?.dm ?? 0) / 60_000), samples: t?.n ?? 0 };
        });
        const tallies = days.map((date) => a.daily[date]?.[d.id]).filter((t): t is DayTally => Boolean(t));
        const { percent, samples } = uptimePercent(tallies);
        return {
          id: d.id,
          name: d.name,
          description: d.description,
          status,
          fromIncident,
          latencyMs: a.latest?.components[d.id]?.latencyMs ?? null,
          p50Ms: latencyP50(a.recent, d.id, a.now),
          uptime: samples >= MIN_SAMPLES_FOR_UPTIME ? percent : null,
          uptimeSamples: samples,
          days: dayViews,
        };
      });
    return { id: g.id, name: g.name, status: worstKnown(components.map((c) => c.status)), components };
  }).filter((g) => g.components.length > 0);

  const all = groups.flatMap((g) => g.components);
  const merged = mergeTallies(days.flatMap((date) => Object.values(a.daily[date] ?? {})));
  const overallUptime = uptimePercent([merged]);

  return {
    now: a.now,
    checkedAt: a.latest ? new Date(a.latest.at).toISOString() : null,
    overall: summarize(all.map((c) => c.status)),
    maintenanceMessage: a.latest?.maintenanceMessage ?? null,
    groups,
    // Gate on cycles recorded (the busiest component), not on the sum over components.
    uptimeOverall: Math.max(0, ...all.map((c) => c.uptimeSamples)) >= MIN_SAMPLES_FOR_UPTIME ? overallUptime.percent : null,
    historyDays: withData.size || days.filter((d) => a.daily[d]).length,
    storage: a.storage,
    historyUnavailable: a.historyUnavailable,
    activeIncidents: a.incidents.filter((i) => isActive(i, a.now)),
    upcomingMaintenances: a.incidents.filter((i) => isUpcoming(i, a.now) && i.severity === "maintenance"),
  };
}
