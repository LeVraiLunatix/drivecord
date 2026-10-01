import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter";
import { worst } from "./status-rules";
import type { Incident, IncidentSeverity, IncidentStatus, IncidentUpdate, Status } from "./types";

const STATUSES: IncidentStatus[] = ["investigating", "identified", "monitoring", "resolved"];
const SEVERITIES: IncidentSeverity[] = ["degraded", "partial_outage", "major_outage", "maintenance"];

export const INCIDENT_STATUS_FR: Record<IncidentStatus, string> = {
  investigating: "Enquête en cours",
  identified: "Cause identifiée",
  monitoring: "Surveillance",
  resolved: "Résolu",
};

const validDate = (v: unknown): v is string => typeof v === "string" && !Number.isNaN(Date.parse(v));

/** `## 2026-10-01T10:00:00Z — identified` headings open a dated update; the text below is its body. */
const UPDATE_HEADING = /^##\s+(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?)\s*(?:[—–·-]+\s*([A-Za-zé]+))?\s*$/;

export function parseUpdates(body: string): IncidentUpdate[] {
  const updates: IncidentUpdate[] = [];
  let current: { at: string; status: IncidentStatus | null; lines: string[] } | null = null;
  for (const line of body.replace(/\r\n?/g, "\n").split("\n")) {
    const h = UPDATE_HEADING.exec(line);
    if (h) {
      if (current) updates.push({ at: current.at, status: current.status, body: current.lines.join("\n").trim() });
      const status = STATUSES.find((s) => s === h[2]?.toLowerCase()) ?? null;
      current = { at: h[1]!.includes("T") || h[1]!.includes(" ") ? h[1]!.replace(" ", "T") : `${h[1]}T00:00:00Z`, status, lines: [] };
    } else current?.lines.push(line);
  }
  if (current) updates.push({ at: current.at, status: current.status, body: current.lines.join("\n").trim() });
  return updates.filter((u) => !Number.isNaN(Date.parse(u.at))).sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
}

/** Parses one incident file. Returns null (never throws) when it is malformed, so a typo can't take the page down. */
export function parseIncident(slug: string, source: string): Incident | null {
  const { data, body } = parseFrontmatter(source);
  const title = typeof data.title === "string" ? data.title.trim() : "";
  const status = STATUSES.find((s) => s === data.status);
  const severity = SEVERITIES.find((s) => s === data.severity);
  if (!title || !status || !severity || !validDate(data.startedAt)) return null;
  const resolvedAt = validDate(data.resolvedAt) ? data.resolvedAt : null;
  const endsAt = validDate(data.endsAt) ? data.endsAt : null;
  const comps = data.components;
  const components: Incident["components"] = comps === "all" || comps === null || comps === undefined ? "all" : Array.isArray(comps) ? comps : [comps];
  return {
    slug,
    title,
    status,
    severity,
    components,
    startedAt: data.startedAt,
    resolvedAt: status === "resolved" ? resolvedAt ?? data.startedAt : null,
    endsAt,
    summary: typeof data.summary === "string" ? data.summary : "",
    updates: parseUpdates(body),
  };
}

export function loadIncidents(dir = process.env.STATUS_INCIDENTS_DIR ?? path.join(process.cwd(), "content", "incidents")): Incident[] {
  let files: string[];
  try {
    files = readdirSync(dir).filter((f) => f.endsWith(".md") && !f.startsWith("_"));
  } catch {
    return [];
  }
  const out: Incident[] = [];
  for (const f of files) {
    const slug = f.replace(/\.md$/, "");
    const inc = parseIncident(slug, readFileSync(path.join(dir, f), "utf8"));
    if (inc) out.push(inc);
    else console.warn(`[status] incident ignoré (front-matter invalide) : ${f}`);
  }
  return out.sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
}

export const isActive = (i: Incident, now: number): boolean => i.status !== "resolved" && Date.parse(i.startedAt) <= now;
/** A maintenance announced for later (shown as a notice, forces nothing yet). */
export const isUpcoming = (i: Incident, now: number): boolean => i.status !== "resolved" && Date.parse(i.startedAt) > now;

/** Status an active incident imposes on a component (or null when it doesn't concern it). */
export function forcedStatus(incidents: Incident[], componentId: string, now: number): Status | null {
  const hits = incidents.filter((i) => isActive(i, now) && (i.components === "all" || i.components.includes(componentId)));
  if (!hits.length) return null;
  return worst(hits.map((i): Status => i.severity));
}
