import { describe, expect, it } from "vitest";
import { MemoryStore, RedisStore, storeFromEnv } from "./store";
import type { Latest, Sample } from "./types";

const latest: Latest = { at: 1, components: { a: { status: "operational", latencyMs: 10, fails: 0 } }, maintenanceMessage: null };
const sample: Sample = { t: 1, c: { a: [0, 10] } };
const tally = (n: number) => ({ a: { n, s: [n, 0, 0, 0, 0, 0], dm: 0 } });

describe("MemoryStore", () => {
  it("round-trips latest and samples", async () => {
    const s = new MemoryStore();
    expect(await s.getLatest()).toBeNull();
    await s.setLatest(latest);
    expect(await s.getLatest()).toEqual(latest);
    await s.appendSample("2026-10-01", sample);
    await s.appendSample("2026-10-01", { ...sample, t: 2 });
    expect((await s.getSamples("2026-10-01")).map((x) => x.t)).toEqual([1, 2]);
    expect(await s.getSamples("2026-10-02")).toEqual([]);
  });

  it("drops rollups older than the retention window", async () => {
    const s = new MemoryStore();
    const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
    await s.setDaily(day(100), tally(1), 90);
    await s.setDaily(day(1), tally(1), 90);
    expect(Object.keys(await s.getDaily())).toEqual([day(1)]);
  });
});

/** Minimal Upstash-like REST backend: understands the handful of commands the store sends. */
function fakeUpstash() {
  const kv = new Map<string, string>();
  const lists = new Map<string, string[]>();
  const hashes = new Map<string, Map<string, string>>();
  const calls: (string | number)[][] = [];
  const f = (async (url: string, init: RequestInit) => {
    expect(url.endsWith("/pipeline")).toBe(true);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const cmds = JSON.parse(init.body as string) as (string | number)[][];
    const out = cmds.map((c) => {
      calls.push(c);
      const [op, key, ...rest] = c as [string, string, ...(string | number)[]];
      switch (op) {
        case "GET":
          return { result: kv.get(key) ?? null };
        case "SET":
          kv.set(key, String(rest[0]));
          return { result: "OK" };
        case "RPUSH":
          lists.set(key, [...(lists.get(key) ?? []), String(rest[0])]);
          return { result: lists.get(key)!.length };
        case "EXPIRE":
          return { result: 1 };
        case "LRANGE":
          return { result: lists.get(key) ?? [] };
        case "HSET": {
          const h = hashes.get(key) ?? new Map<string, string>();
          h.set(String(rest[0]), String(rest[1]));
          hashes.set(key, h);
          return { result: 1 };
        }
        case "HKEYS":
          return { result: [...(hashes.get(key)?.keys() ?? [])] };
        case "HDEL":
          rest.forEach((r) => hashes.get(key)?.delete(String(r)));
          return { result: rest.length };
        case "HGETALL":
          return { result: [...(hashes.get(key) ?? new Map<string, string>()).entries()].flat() };
        default:
          return { error: `unknown ${op}` };
      }
    });
    return new Response(JSON.stringify(out), { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("RedisStore", () => {
  it("speaks the REST pipeline protocol and round-trips data", async () => {
    const { f, calls } = fakeUpstash();
    const s = new RedisStore("https://kv.example", "tok", f);
    expect(await s.getLatest()).toBeNull();
    await s.setLatest(latest);
    expect(await s.getLatest()).toEqual(latest);
    await s.appendSample("2026-10-01", sample);
    expect(await s.getSamples("2026-10-01")).toEqual([sample]);
    expect(calls.some((c) => c[0] === "EXPIRE")).toBe(true);
    const day = new Date().toISOString().slice(0, 10);
    await s.setDaily("2020-01-01", tally(1), 90);
    await s.setDaily(day, tally(2), 90);
    const daily = await s.getDaily();
    expect(Object.keys(daily)).toEqual([day]);
    expect(daily[day]!.a!.n).toBe(2);
  });

  it("surfaces store failures instead of hiding them", async () => {
    const down = (async () => new Response("nope", { status: 500 })) as unknown as typeof fetch;
    await expect(new RedisStore("https://kv.example", "tok", down).getLatest()).rejects.toThrow("store 500");
  });
});

describe("storeFromEnv", () => {
  it("uses Redis when configured (Vercel KV or Upstash names) and memory otherwise", () => {
    expect(storeFromEnv({}).kind).toBe("memory");
    expect(storeFromEnv({ KV_REST_API_URL: "https://x", KV_REST_API_TOKEN: "t" }).kind).toBe("redis");
    expect(storeFromEnv({ UPSTASH_REDIS_REST_URL: "https://x", UPSTASH_REDIS_REST_TOKEN: "t" }).kind).toBe("redis");
    expect(storeFromEnv({ KV_REST_API_URL: "https://x" }).kind).toBe("memory");
  });
});
