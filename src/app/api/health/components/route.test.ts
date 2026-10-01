import { beforeEach, describe, expect, it, vi } from "vitest";

const rateLimit = vi.fn();
const getComponentsPayload = vi.fn();

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: (...a: unknown[]) => rateLimit(...a),
  rateLimitHeaders: (r: { limit: number; remaining: number; resetSec: number; ok: boolean; retryAfterSec: number }) => ({
    "RateLimit-Limit": String(r.limit),
    ...(r.ok ? {} : { "Retry-After": String(r.retryAfterSec) }),
  }),
  getClientIp: (req: Request) => req.headers.get("x-forwarded-for") ?? "unknown",
}));
vi.mock("@/lib/health", () => ({ getComponentsPayload: () => getComponentsPayload() }));

import { GET } from "./route";

const req = (ip = "1.2.3.4") => new Request("https://drivecord.app/api/health/components", { headers: { "x-forwarded-for": ip } });
const PAYLOAD = { components: [{ id: "db", status: "operational", latencyMs: 5 }], maintenance: null };

beforeEach(() => {
  rateLimit.mockReset();
  getComponentsPayload.mockReset().mockResolvedValue(PAYLOAD);
});

describe("GET /api/health/components", () => {
  it("serves the payload, uncached by browsers", async () => {
    rateLimit.mockResolvedValue({ ok: true, limit: 60, remaining: 59, resetSec: 60, retryAfterSec: 0 });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual(PAYLOAD);
  });

  it("rate-limits per client IP", async () => {
    rateLimit.mockResolvedValue({ ok: false, limit: 60, remaining: 0, resetSec: 30, retryAfterSec: 30 });
    const res = await GET(req("9.9.9.9"));
    expect(rateLimit).toHaveBeenCalledWith("health:components:ip:9.9.9.9", 60, 60);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("30");
    expect(getComponentsPayload).not.toHaveBeenCalled();
  });

  it("still answers when the rate limiter cannot reach the database (the payload then reports it)", async () => {
    rateLimit.mockRejectedValue(new Error("db down"));
    getComponentsPayload.mockResolvedValue({ components: [{ id: "db", status: "down", latencyMs: null }], maintenance: null });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect((await res.json()).components[0].status).toBe("down");
  });
});
