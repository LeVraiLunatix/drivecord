import { afterEach, describe, expect, it, vi } from "vitest";
import crypto from "crypto";

vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/discord-roles", () => ({ syncDiscordRoles: vi.fn() }));

import { centsToTier, verifyWebhookSignature } from "./patreon";

describe("centsToTier", () => {
  it("maps pledge amounts to tiers", () => {
    expect([0, 499, 500, 999, 1000, 1499, 1500].map(centsToTier)).toEqual([0, 0, 1, 1, 2, 2, 3]);
  });
});

describe("verifyWebhookSignature", () => {
  afterEach(() => vi.unstubAllEnvs());
  const sign = (body: string) => crypto.createHmac("md5", "s3cret").update(body).digest("hex");

  it("accepts the right signature, rejects wrong, missing or unconfigured", () => {
    vi.stubEnv("PATREON_WEBHOOK_SECRET", "s3cret");
    expect(verifyWebhookSignature("{}", sign("{}"))).toBe(true);
    expect(verifyWebhookSignature("{}", sign("{x}"))).toBe(false);
    expect(verifyWebhookSignature("{}", null)).toBe(false);
    expect(verifyWebhookSignature("{}", "short")).toBe(false);
    vi.stubEnv("PATREON_WEBHOOK_SECRET", "");
    expect(verifyWebhookSignature("{}", sign("{}"))).toBe(false);
  });
});
