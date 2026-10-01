import { describe, expect, it } from "vitest";
import { COMPONENTS, originsFromEnv, type HttpProbe } from "./components";
import { controlReachable, fetchHealth, probeAll, resolveHealth, runHttpProbe, USER_AGENT, type HealthFetch } from "./probe";

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const html = (status = 200) => new Response("<!DOCTYPE html><html><body>ok</body></html>", { status, headers: { "content-type": "text/html; charset=utf-8" } });
const fakeFetch = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
  (async (url: string | URL, init?: RequestInit) => handler(String(url), init ?? {})) as unknown as typeof fetch;

const jsonProbe: HttpProbe = { kind: "http", url: () => "https://x", expect: [401], body: "json", check: (b) => typeof b === "object" && b !== null && "error" in b };

describe("runHttpProbe", () => {
  it("treats the expected clean 401 JSON as healthy and measures latency", async () => {
    const r = await runHttpProbe(jsonProbe, "https://x", fakeFetch(() => json({ error: { code: "unauthorized" } }, 401)));
    expect(r.raw).toBe("ok");
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("identifies itself and never sends credentials", async () => {
    let seen: RequestInit = {};
    await runHttpProbe(jsonProbe, "https://x", fakeFetch((_u, init) => ((seen = init), json({ error: 1 }, 401))));
    expect((seen.headers as Record<string, string>)["User-Agent"]).toBe(USER_AGENT);
    expect(seen.method).toBe("GET");
    expect(Object.keys(seen.headers as object).map((k) => k.toLowerCase())).not.toContain("authorization");
  });

  it("fails on an unexpected status code", async () => {
    expect((await runHttpProbe(jsonProbe, "https://x", fakeFetch(() => json({ error: 1 }, 500)))).raw).toBe("fail");
    expect((await runHttpProbe(jsonProbe, "https://x", fakeFetch(() => json({ ok: true }, 200)))).raw).toBe("fail");
  });

  it("fails when the body is not what a healthy deployment returns (a dead host's generic page)", async () => {
    expect((await runHttpProbe(jsonProbe, "https://x", fakeFetch(() => html(401)))).raw).toBe("fail");
    expect((await runHttpProbe(jsonProbe, "https://x", fakeFetch(() => json({ nothing: 1 }, 401)))).raw).toBe("fail");
    const page: HttpProbe = { kind: "http", url: () => "https://x", expect: [200], body: "html" };
    expect((await runHttpProbe(page, "https://x", fakeFetch(() => new Response("Bad gateway", { status: 200, headers: { "content-type": "text/plain" } })))).raw).toBe("fail");
    expect((await runHttpProbe(page, "https://x", fakeFetch(() => html()))).raw).toBe("ok");
  });

  it("fails on a network error", async () => {
    const r = await runHttpProbe(jsonProbe, "https://x", fakeFetch(() => Promise.reject(new TypeError("fetch failed"))));
    expect(r.raw).toBe("fail");
  });

  it("only checks the status for body-less probes", async () => {
    const redirect: HttpProbe = { kind: "http", url: () => "https://x", expect: [307] };
    expect((await runHttpProbe(redirect, "https://x", fakeFetch(() => new Response(null, { status: 307, headers: { location: "/login" } })))).raw).toBe("ok");
  });
});

describe("health components", () => {
  const payload = (components: { id: string; status: string; latencyMs: number | null }[], maintenance: { message: string } | null = null) => ({ components, maintenance });

  it("maps Drivecord's own statuses to probe results", () => {
    const h: HealthFetch = {
      ok: true,
      latencyMs: 10,
      payload: payload([
        { id: "db", status: "operational", latencyMs: 12 },
        { id: "discord", status: "degraded", latencyMs: 2500 },
        { id: "auth", status: "down", latencyMs: null },
        { id: "email", status: "maintenance", latencyMs: null },
        { id: "push", status: "unknown", latencyMs: null },
      ]) as never,
    };
    expect(resolveHealth(h, "db")).toEqual({ raw: "ok", latencyMs: 12 });
    expect(resolveHealth(h, "discord").raw).toBe("slow");
    expect(resolveHealth(h, "auth").raw).toBe("fail");
    expect(resolveHealth(h, "email").raw).toBe("maintenance");
    expect(resolveHealth(h, "push").raw).toBe("unknown");
    expect(resolveHealth(h, "missing").raw).toBe("unknown");
  });

  it("reports unknown (not an outage) when the endpoint is missing or the app is unreachable", async () => {
    const o = originsFromEnv({});
    const notDeployed = await fetchHealth(o, fakeFetch(() => new Response("nf", { status: 404 })));
    expect(notDeployed).toEqual({ ok: false, reason: "invalid" });
    expect(resolveHealth(notDeployed, "db").raw).toBe("unknown");
    const unreachable = await fetchHealth(o, fakeFetch(() => Promise.reject(new Error("x"))));
    expect(unreachable).toEqual({ ok: false, reason: "unreachable" });
    expect(resolveHealth(unreachable, "db").raw).toBe("unknown");
    expect((await fetchHealth(o, fakeFetch(() => json({ nope: 1 })))).ok).toBe(false);
  });
});

describe("probeAll", () => {
  const o = originsFromEnv({});
  it("probes every component once, with GET requests only", async () => {
    const methods = new Set<string>();
    const urls: string[] = [];
    const f = fakeFetch((url, init) => {
      methods.add(init.method ?? "GET");
      urls.push(url);
      if (url.endsWith("/api/health/components")) return json({ components: [{ id: "db", status: "operational", latencyMs: 5 }], maintenance: { message: "Maintenance ce soir." } });
      return json({}, 200);
    });
    const r = await probeAll(o, f);
    expect([...methods]).toEqual(["GET"]);
    expect(r.maintenanceMessage).toBe("Maintenance ce soir.");
    expect(r.results.db).toEqual({ raw: "ok", latencyMs: 5 });
    expect(Object.keys(r.results).length).toBe(COMPONENTS.filter((c) => c.probe.kind === "health" || c.probe.url(o) !== null).length);
    // No probe URL carries a query string (so no secret or personal data) or embedded credentials.
    expect(urls.every((u) => !u.includes("?") && !new URL(u).username)).toBe(true);
  });

  it("flags a missing network on our side when everything, including the control request, fails", async () => {
    const r = await probeAll(o, fakeFetch(() => Promise.reject(new Error("offline"))));
    expect(r.networkOk).toBe(false);
  });

  it("still trusts the results when only Drivecord is down (the control request works)", async () => {
    const r = await probeAll(o, fakeFetch((url) => (url.includes("cloudflare.com") ? new Response("ok") : Promise.reject(new Error("down")) as never)));
    expect(r.networkOk).toBe(true);
    expect(r.results.site!.raw).toBe("fail");
  });

  it("controlReachable follows redirects and tolerates errors", async () => {
    expect(await controlReachable("https://control.example", fakeFetch(() => new Response("ok")))).toBe(true);
    expect(await controlReachable("https://control.example", fakeFetch(() => Promise.reject(new Error("x"))))).toBe(false);
  });
});
