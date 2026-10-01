/** Shared types for the Drivecord status page. No dependency on the main app. */

export type Status =
  | "operational"
  | "degraded"
  | "partial_outage"
  | "major_outage"
  | "maintenance"
  | "unknown";

/** Index into this array is what samples store (compact JSON in the store). */
export const STATUS_CODES: readonly Status[] = [
  "operational",
  "degraded",
  "partial_outage",
  "major_outage",
  "maintenance",
  "unknown",
];

export const STATUS_LABEL_FR: Record<Status, string> = {
  operational: "Opérationnel",
  degraded: "Dégradé",
  partial_outage: "Panne partielle",
  major_outage: "Panne majeure",
  maintenance: "Maintenance",
  unknown: "Non vérifié",
};

/** What one probe saw, before the rules turn it into a `Status`. */
export type Raw = "ok" | "slow" | "fail" | "unknown" | "maintenance";

export type Observation = { id: string; raw: Raw; latencyMs: number | null };

export type ComponentState = {
  status: Status;
  /** Latency of the last successful probe, null when none. */
  latencyMs: number | null;
  /** Consecutive failed probes (drives degraded → partial → major). */
  fails: number;
};

export type Latest = {
  /** Epoch ms of the probe cycle. */
  at: number;
  components: Record<string, ComponentState>;
  /** Message set by the Drivecord operators (`MAINTENANCE_MESSAGE`), if any. */
  maintenanceMessage: string | null;
};

/** One probe cycle: component id → [status code, latency ms or -1]. */
export type Sample = { t: number; c: Record<string, [number, number]> };

/** Per-day tally of one component: `n` samples, `s` counts indexed like STATUS_CODES, `dm` ms of outage. */
export type DayTally = { n: number; s: number[]; dm: number };
export type DayRollup = Record<string, DayTally>;

export type GroupId = "web" | "account" | "storage" | "developers" | "services";

export type IncidentStatus = "investigating" | "identified" | "monitoring" | "resolved";
export type IncidentSeverity = "degraded" | "partial_outage" | "major_outage" | "maintenance";

export type IncidentUpdate = { at: string; status: IncidentStatus | null; body: string };

export type Incident = {
  slug: string;
  title: string;
  status: IncidentStatus;
  severity: IncidentSeverity;
  /** Component ids, or "all". */
  components: string[] | "all";
  startedAt: string;
  resolvedAt: string | null;
  /** Planned end of a maintenance. */
  endsAt: string | null;
  summary: string;
  updates: IncidentUpdate[];
};

export type ChangelogEntry = {
  title: string;
  slug: string;
  /** ISO date (yyyy-mm-dd) or null when nothing could be established. */
  date: string | null;
  markdown: string;
};
