import type { DayRollup, Latest, Sample } from "./types";

/**
 * Where probe history lives — never in Drivecord's database (the status page must survive its outage).
 * Production: Upstash Redis / Vercel KV over its REST API (plain fetch, no dependency).
 * Dev and tests: in memory.
 */
export interface Store {
  readonly kind: "memory" | "redis";
  getLatest(): Promise<Latest | null>;
  setLatest(latest: Latest): Promise<void>;
  /** Appends a cycle to a day's log (`day` = yyyy-mm-dd, UTC). */
  appendSample(day: string, sample: Sample): Promise<void>;
  getSamples(day: string): Promise<Sample[]>;
  getDaily(): Promise<Record<string, DayRollup>>;
  /** Stores a day's rollup and drops rollups older than `keepDays`. */
  setDaily(day: string, rollup: DayRollup, keepDays: number): Promise<void>;
}

export const HISTORY_DAYS = 90;
const SAMPLE_TTL_SEC = (HISTORY_DAYS + 10) * 86_400;

// ── Memory ──────────────────────────────────────────────────────────────────

export class MemoryStore implements Store {
  readonly kind = "memory" as const;
  private latest: Latest | null = null;
  private samples = new Map<string, Sample[]>();
  private daily = new Map<string, DayRollup>();

  async getLatest() {
    return this.latest;
  }
  async setLatest(latest: Latest) {
    this.latest = latest;
  }
  async appendSample(day: string, sample: Sample) {
    const list = this.samples.get(day) ?? [];
    list.push(sample);
    this.samples.set(day, list);
  }
  async getSamples(day: string) {
    return [...(this.samples.get(day) ?? [])];
  }
  async getDaily() {
    return Object.fromEntries(this.daily);
  }
  async setDaily(day: string, rollup: DayRollup, keepDays: number) {
    this.daily.set(day, rollup);
    const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString().slice(0, 10);
    for (const k of [...this.daily.keys()]) if (k < cutoff) this.daily.delete(k);
  }
}

// ── Upstash / Vercel KV (REST) ──────────────────────────────────────────────

type Cmd = (string | number)[];

export class RedisStore implements Store {
  readonly kind = "redis" as const;
  constructor(
    private readonly url: string,
    private readonly token: string,
    private readonly f: typeof fetch = fetch,
  ) {}

  private async pipeline(cmds: Cmd[]): Promise<unknown[]> {
    const res = await this.f(`${this.url}/pipeline`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(cmds),
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) throw new Error(`store ${res.status}`);
    const out = (await res.json()) as { result?: unknown; error?: string }[];
    const bad = out.find((r) => r.error);
    if (bad) throw new Error("store command failed");
    return out.map((r) => r.result);
  }

  private parse<T>(v: unknown): T | null {
    if (typeof v !== "string") return null;
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }

  async getLatest() {
    const [v] = await this.pipeline([["GET", "status:latest"]]);
    return this.parse<Latest>(v);
  }
  async setLatest(latest: Latest) {
    await this.pipeline([["SET", "status:latest", JSON.stringify(latest)]]);
  }
  async appendSample(day: string, sample: Sample) {
    const key = `status:samples:${day}`;
    await this.pipeline([
      ["RPUSH", key, JSON.stringify(sample)],
      ["EXPIRE", key, SAMPLE_TTL_SEC],
    ]);
  }
  async getSamples(day: string) {
    const [v] = await this.pipeline([["LRANGE", `status:samples:${day}`, 0, -1]]);
    if (!Array.isArray(v)) return [];
    return v.map((x) => this.parse<Sample>(x)).filter((x): x is Sample => x !== null);
  }
  async getDaily() {
    const [v] = await this.pipeline([["HGETALL", "status:daily"]]);
    const out: Record<string, DayRollup> = {};
    if (Array.isArray(v)) {
      // Upstash returns a flat [field, value, field, value, …] array.
      for (let i = 0; i + 1 < v.length; i += 2) {
        const r = this.parse<DayRollup>(v[i + 1]);
        if (r) out[String(v[i])] = r;
      }
    }
    return out;
  }
  async setDaily(day: string, rollup: DayRollup, keepDays: number) {
    const cutoff = new Date(Date.now() - keepDays * 86_400_000).toISOString().slice(0, 10);
    const [fields] = await this.pipeline([["HKEYS", "status:daily"]]);
    const stale = Array.isArray(fields) ? (fields as string[]).filter((d) => d < cutoff) : [];
    const cmds: Cmd[] = [["HSET", "status:daily", day, JSON.stringify(rollup)]];
    if (stale.length) cmds.push(["HDEL", "status:daily", ...stale]);
    await this.pipeline(cmds);
  }
}

// ── Selection ───────────────────────────────────────────────────────────────

const g = globalThis as unknown as { __statusMemoryStore?: MemoryStore };

export function storeFromEnv(env: Record<string, string | undefined> = process.env): Store {
  const url = env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) return new RedisStore(url.replace(/\/+$/, ""), token);
  g.__statusMemoryStore ??= new MemoryStore();
  return g.__statusMemoryStore;
}
