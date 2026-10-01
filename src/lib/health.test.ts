import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const queryRaw = vi.fn();
vi.mock("@/lib/prisma", () => ({ prisma: { $queryRaw: (...a: unknown[]) => queryRaw(...a) } }));

const ENV_KEYS = ["AUTH_SECRET", "AUTH_RESEND_KEY", "AUTH_PATREON_ID", "MAINTENANCE_MESSAGE", "MAINTENANCE_COMPONENTS"] as const;
const saved: Record<string, string | undefined> = {};
const realFetch = globalThis.fetch;
let fetchCalls: { url: string; init?: RequestInit }[] = [];

const fakeFetch = (handler: (url: string) => Response | Promise<Response>) => {
  globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
    fetchCalls.push({ url: String(url), init });
    return handler(String(url));
  }) as typeof fetch;
};

beforeEach(() => {
  vi.resetModules();
  queryRaw.mockReset();
  fetchCalls = [];
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  for (const k of ENV_KEYS) delete process.env[k];
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const load = () => import("./health");

describe("getComponentsPayload", () => {
  it("reports every component with only id, status and latency", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    process.env.AUTH_SECRET = "s";
    process.env.AUTH_RESEND_KEY = "re_secret_key";
    process.env.AUTH_PATREON_ID = "pid";
    fakeFetch((url) => (url.includes("discord.com") ? new Response("{}", { status: 200 }) : new Response("unauthorized", { status: 401 })));
    const { getComponentsPayload } = await load();
    const p = await getComponentsPayload();
    expect(p.components.map((c) => c.id)).toEqual(["db", "discord", "auth", "email", "push", "patreon"]);
    expect(Object.fromEntries(p.components.map((c) => [c.id, c.status]))).toEqual({
      db: "operational",
      discord: "operational",
      auth: "operational",
      email: "operational", // 401 from the read-only probe still proves the API is reachable
      push: "unknown", // no side-effect-free check exists
      patreon: "operational",
    });
    for (const c of p.components) expect(Object.keys(c).sort()).toEqual(["id", "latencyMs", "status"]);
    expect(p.maintenance).toBeNull();
    // Nothing sensitive in the output.
    expect(JSON.stringify(p)).not.toMatch(/re_secret_key|password|postgres|secret/i);
  });

  it("is read-only: only GET requests, and the Resend call lists domains rather than sending anything", async () => {
    queryRaw.mockResolvedValue([]);
    process.env.AUTH_SECRET = "s";
    process.env.AUTH_RESEND_KEY = "re_x";
    process.env.AUTH_PATREON_ID = "pid";
    fakeFetch(() => new Response("{}", { status: 200 }));
    const { getComponentsPayload } = await load();
    await getComponentsPayload();
    expect(fetchCalls.length).toBeGreaterThan(0);
    for (const c of fetchCalls) expect((c.init?.method ?? "GET").toUpperCase()).toBe("GET");
    expect(fetchCalls.find((c) => c.url.includes("resend.com"))!.url).toBe("https://api.resend.com/domains");
    expect(fetchCalls.some((c) => c.url.includes("/emails"))).toBe(false);
  });

  it("reports the database and auth as down when the database does not answer", async () => {
    queryRaw.mockRejectedValue(new Error("connect ECONNREFUSED db.internal:5432"));
    process.env.AUTH_SECRET = "s";
    fakeFetch(() => new Response("{}", { status: 200 }));
    const { getComponentsPayload } = await load();
    const p = await getComponentsPayload();
    expect(p.components.find((c) => c.id === "db")).toEqual({ id: "db", status: "down", latencyMs: null });
    expect(p.components.find((c) => c.id === "auth")!.status).toBe("down");
    expect(JSON.stringify(p)).not.toContain("ECONNREFUSED");
  });

  it("reports unknown for services that are not configured, and down for an unreachable third party", async () => {
    queryRaw.mockResolvedValue([]);
    fakeFetch((url) => (url.includes("discord.com") ? new Response("down", { status: 503 }) : new Response("{}", { status: 200 })));
    const { getComponentsPayload } = await load();
    const p = await getComponentsPayload();
    const by = Object.fromEntries(p.components.map((c) => [c.id, c.status]));
    expect(by.discord).toBe("down");
    expect(by.email).toBe("unknown");
    expect(by.patreon).toBe("unknown");
    expect(by.auth).toBe("down"); // AUTH_SECRET missing
  });

  it("puts the announced components in maintenance and exposes the notice", async () => {
    queryRaw.mockResolvedValue([]);
    process.env.AUTH_SECRET = "s";
    process.env.MAINTENANCE_MESSAGE = "Maintenance ce soir.";
    process.env.MAINTENANCE_COMPONENTS = "db,email";
    fakeFetch(() => new Response("{}", { status: 200 }));
    const { getComponentsPayload } = await load();
    const p = await getComponentsPayload();
    expect(p.maintenance).toEqual({ message: "Maintenance ce soir." });
    expect(p.components.filter((c) => c.status === "maintenance").map((c) => c.id)).toEqual(["db", "email"]);
  });

  it("caches the payload so a burst of polls is one round of checks", async () => {
    queryRaw.mockResolvedValue([]);
    process.env.AUTH_SECRET = "s";
    fakeFetch(() => new Response("{}", { status: 200 }));
    const { getComponentsPayload } = await load();
    await Promise.all([getComponentsPayload(), getComponentsPayload(), getComponentsPayload()]);
    await getComponentsPayload();
    // db + auth: one query each, once.
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });
});
