import { activeComponents, type ComponentDef, type HttpProbe, type Origins } from "./components";
import type { Raw } from "./types";

export const USER_AGENT = "DrivecordStatus/1";
export const PROBE_TIMEOUT_MS = 5000;
export const DEFAULT_SLOW_MS = 2000;

export type ProbeResult = { raw: Raw; latencyMs: number | null; detail?: string };

type Fetcher = typeof fetch;

async function timedFetch(f: Fetcher, url: string, follow: boolean, readBody: boolean): Promise<{ res: Response; ms: number; text: string | null }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), PROBE_TIMEOUT_MS);
  const start = performance.now();
  try {
    const res = await f(url, {
      method: "GET",
      redirect: follow ? "follow" : "manual",
      signal: ctrl.signal,
      headers: { "User-Agent": USER_AGENT, Accept: "application/json, text/html;q=0.9, */*;q=0.5" },
    });
    // Body is read only when needed; the timer keeps running so a stalled body counts as a failure.
    const text = readBody ? (await res.text()).slice(0, 262_144) : null;
    if (!readBody) void res.body?.cancel().catch(() => {});
    return { res, ms: Math.round(performance.now() - start), text };
  } finally {
    clearTimeout(timer);
  }
}

function matchesBody(p: HttpProbe, res: Response, text: string): boolean {
  if (p.body === "json") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return false;
    }
    return p.check ? p.check(parsed) : true;
  }
  // The content type is checked too: a CDN error page also contains "<html".
  return (res.headers.get("content-type") ?? "").includes("text/html") && /<html[\s>]/i.test(text);
}

/** Runs one HTTP probe. Never throws; a network error, timeout or unexpected answer is a `fail`. */
export async function runHttpProbe(p: HttpProbe, url: string, f: Fetcher = fetch): Promise<ProbeResult> {
  try {
    const { res, ms, text } = await timedFetch(f, url, p.follow ?? false, Boolean(p.body));
    if (!p.expect.includes(res.status)) return { raw: "fail", latencyMs: null, detail: `HTTP ${res.status}` };
    if (p.body && !matchesBody(p, res, text ?? "")) return { raw: "fail", latencyMs: null, detail: "unexpected body" };
    return { raw: "ok", latencyMs: ms };
  } catch (e) {
    return { raw: "fail", latencyMs: null, detail: e instanceof Error ? e.name : "error" };
  }
}

/** Shape of Drivecord's `GET /api/health/components`. */
export type HealthComponentsPayload = {
  components: { id: string; status: "operational" | "degraded" | "down" | "maintenance" | "unknown"; latencyMs: number | null }[];
  maintenance: { message: string } | null;
};

export type HealthFetch =
  | { ok: true; payload: HealthComponentsPayload; latencyMs: number }
  | { ok: false; reason: "unreachable" | "invalid" };

export async function fetchHealth(o: Origins, f: Fetcher = fetch): Promise<HealthFetch> {
  try {
    const { res, ms, text } = await timedFetch(f, `${o.app}/api/health/components`, false, true);
    // 404 = Drivecord not yet updated with the route; anything else non-200 = the app itself is struggling.
    if (res.status !== 200) return { ok: false, reason: res.status === 404 ? "invalid" : "unreachable" };
    const json = JSON.parse(text ?? "") as HealthComponentsPayload;
    if (!Array.isArray(json?.components)) return { ok: false, reason: "invalid" };
    return { ok: true, payload: json, latencyMs: ms };
  } catch {
    return { ok: false, reason: "unreachable" };
  }
}

export function resolveHealth(h: HealthFetch, key: string): ProbeResult {
  // The app answering badly says nothing about the dependency itself: report "not verifiable", not an outage.
  if (!h.ok) return { raw: "unknown", latencyMs: null };
  const c = h.payload.components.find((x) => x.id === key);
  if (!c) return { raw: "unknown", latencyMs: null };
  switch (c.status) {
    case "operational":
      return { raw: "ok", latencyMs: c.latencyMs };
    case "degraded":
      return { raw: "slow", latencyMs: c.latencyMs };
    case "down":
      return { raw: "fail", latencyMs: null };
    case "maintenance":
      return { raw: "maintenance", latencyMs: c.latencyMs };
    default:
      return { raw: "unknown", latencyMs: null };
  }
}

/** Tells "Drivecord is down" from "this status service has no network" (see Origins.control). */
export async function controlReachable(url: string, f: Fetcher = fetch): Promise<boolean> {
  try {
    const { res } = await timedFetch(f, url, true, false);
    return res.ok;
  } catch {
    return false;
  }
}

export type CycleProbes = {
  results: Record<string, ProbeResult>;
  maintenanceMessage: string | null;
  /** False when even the control request failed: nothing reliable can be said, record no sample. */
  networkOk: boolean;
};

/** Probes every active component once, in parallel. */
export async function probeAll(o: Origins, f: Fetcher = fetch): Promise<CycleProbes> {
  const defs: ComponentDef[] = activeComponents(o);
  const [health, networkOk] = await Promise.all([fetchHealth(o, f), controlReachable(o.control, f)]);
  const entries = await Promise.all(
    defs.map(async (c): Promise<[string, ProbeResult]> => {
      if (c.probe.kind === "health") return [c.id, resolveHealth(health, c.probe.key)];
      const url = c.probe.url(o)!;
      const r = await runHttpProbe(c.probe, url, f);
      return [c.id, r];
    }),
  );
  const results = Object.fromEntries(entries);
  const allFailed = entries.every(([, r]) => r.raw === "fail" || r.raw === "unknown");
  return {
    results,
    maintenanceMessage: health.ok ? health.payload.maintenance?.message?.slice(0, 300) ?? null : null,
    // If every probe failed AND the control request did too, this service is the one without network.
    networkOk: networkOk || !allFailed,
  };
}
