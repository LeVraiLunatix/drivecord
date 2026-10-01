import { GROUPS } from "./components";
import type { Snapshot } from "./snapshot";
import type { Status } from "./types";

/** Statuspage-style indicator, so existing tooling can read it. */
export type Indicator = "none" | "minor" | "major" | "critical" | "maintenance" | "unknown";

const INDICATOR: Record<Status, Indicator> = {
  operational: "none",
  degraded: "minor",
  partial_outage: "major",
  major_outage: "critical",
  maintenance: "maintenance",
  unknown: "unknown",
};

export type PublicSummary = {
  page: { name: string; url: string; updatedAt: string | null };
  status: { indicator: Indicator; status: Status; description: string };
  maintenance: { message: string } | null;
  activeIncidents: number;
};

export function serializeSummary(s: Snapshot, site: string): PublicSummary {
  return {
    page: { name: "Drivecord", url: site, updatedAt: s.checkedAt },
    status: { indicator: INDICATOR[s.overall.status], status: s.overall.status, description: s.overall.text },
    maintenance: s.maintenanceMessage ? { message: s.maintenanceMessage } : null,
    activeIncidents: s.activeIncidents.length,
  };
}

export function serializeStatus(s: Snapshot, site: string) {
  return {
    ...serializeSummary(s, site),
    groups: GROUPS.map((g) => ({ id: g.id, name: g.name })).filter((g) => s.groups.some((x) => x.id === g.id)),
    components: s.groups.flatMap((g) =>
      g.components.map((c) => ({
        id: c.id,
        name: c.name,
        group: g.id,
        status: c.status,
        latencyMs: c.latencyMs,
        latencyP50Ms24h: c.p50Ms,
        uptime90d: c.uptime === null ? null : Math.round(c.uptime * 1000) / 1000,
      })),
    ),
    uptime90d: s.uptimeOverall === null ? null : Math.round(s.uptimeOverall * 1000) / 1000,
    historyDays: s.historyDays,
    incidents: s.activeIncidents.map((i) => ({
      slug: i.slug,
      title: i.title,
      status: i.status,
      severity: i.severity,
      components: i.components,
      startedAt: i.startedAt,
      url: `${site}/incidents/${i.slug}`,
    })),
    scheduledMaintenances: s.upcomingMaintenances.map((i) => ({ slug: i.slug, title: i.title, startsAt: i.startedAt, endsAt: i.endsAt, components: i.components, url: `${site}/incidents/${i.slug}` })),
  };
}

/** Read-only, cross-origin: anyone may embed the status in their own tooling. */
export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "public, max-age=15, s-maxage=30, stale-while-revalidate=60",
};
