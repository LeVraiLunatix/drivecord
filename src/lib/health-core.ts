/**
 * Pure logic behind `GET /api/health/components` (what the public status page reads). No I/O here, so it is
 * unit-tested; `health.ts` does the actual checks.
 *
 * Nothing in this payload may reveal internals: only a component id, a coarse status and a latency.
 */

export type HealthStatus = "operational" | "degraded" | "down" | "maintenance" | "unknown";

export type ComponentHealth = { id: string; status: HealthStatus; latencyMs: number | null };

export const COMPONENT_IDS = ["db", "discord", "auth", "email", "push", "patreon"] as const;
export type ComponentId = (typeof COMPONENT_IDS)[number];

/** An answer slower than this is reported as degraded. */
export const SLOW_MS = 2000;

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

/** Measures a check: up → operational (or degraded when slow), failure → down. */
export async function measure(check: () => Promise<unknown>, timeoutMs: number): Promise<{ status: HealthStatus; latencyMs: number | null }> {
  const start = Date.now();
  try {
    await withTimeout(check(), timeoutMs);
    const latencyMs = Date.now() - start;
    return { status: latencyMs > SLOW_MS ? "degraded" : "operational", latencyMs };
  } catch {
    return { status: "down", latencyMs: null };
  }
}

export type Maintenance = {
  /** Operators' notice (`MAINTENANCE_MESSAGE`), null when no maintenance is announced. */
  message: string | null;
  /** Components concerned (`MAINTENANCE_COMPONENTS`, default: all). */
  components: ReadonlySet<string>;
};

export function parseMaintenance(message: string | undefined, components: string | undefined): Maintenance {
  const text = message?.trim().slice(0, 300) || null;
  const wanted = (components ?? "")
    .split(",")
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  const all = wanted.length === 0 || wanted.includes("all");
  const set = new Set<string>(all ? COMPONENT_IDS : wanted.filter((c): c is ComponentId => (COMPONENT_IDS as readonly string[]).includes(c)));
  return { message: text, components: set };
}

/** While a maintenance is announced, the components it concerns report `maintenance`. */
export function applyMaintenance(list: ComponentHealth[], m: Maintenance): ComponentHealth[] {
  if (!m.message) return list;
  return list.map((c) => (m.components.has(c.id) ? { id: c.id, status: "maintenance", latencyMs: null } : c));
}

export type ComponentsPayload = { components: ComponentHealth[]; maintenance: { message: string } | null };

export function buildPayload(list: ComponentHealth[], m: Maintenance): ComponentsPayload {
  return { components: applyMaintenance(list, m), maintenance: m.message ? { message: m.message } : null };
}
