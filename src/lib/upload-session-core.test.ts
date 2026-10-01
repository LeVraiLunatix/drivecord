import { describe, expect, it, vi } from "vitest";
import {
  assertContiguous,
  assertSessionUsable,
  assertSizeMatches,
  MAX_CHUNKS,
  parseChunkIndex,
  resolveLegacyChunks,
  toChunkRefs,
  UploadError,
  type SessionLike,
} from "./upload-session-core";
import type { DiscordMessage } from "./discord";

const KEY = "key_1";
const WH = "wh_1";
const FUTURE = new Date(Date.now() + 3_600_000);
const session = (over: Partial<SessionLike> = {}): SessionLike => ({
  apiKeyId: KEY, webhookId: WH, status: "open", expiresAt: FUTURE, expectedChunks: null, ...over,
});
const owner = { apiKeyId: KEY, webhookId: WH };
const fails = (fn: () => unknown, status: number) =>
  expect(fn).toThrow(expect.objectContaining({ name: "UploadError", status }));

describe("assertSessionUsable", () => {
  it("accepts our open, unexpired session", () => expect(() => assertSessionUsable(session(), owner)).not.toThrow());

  it("a session of ANOTHER key is indistinguishable from a missing one (404)", () => {
    fails(() => assertSessionUsable(session({ apiKeyId: "other" }), owner), 404);
    fails(() => assertSessionUsable(null, owner), 404);
  });

  it("a session bound to another webhook is refused (404)", () => {
    fails(() => assertSessionUsable(session({ webhookId: "other" }), owner), 404);
  });

  it("completed / aborted sessions are refused (409)", () => {
    fails(() => assertSessionUsable(session({ status: "completed" }), owner), 409);
    fails(() => assertSessionUsable(session({ status: "aborted" }), owner), 409);
  });

  it("expired sessions are refused (410)", () => {
    const now = Date.now();
    fails(() => assertSessionUsable(session({ expiresAt: new Date(now - 1) }), owner, now), 410);
    fails(() => assertSessionUsable(session({ expiresAt: new Date(now) }), owner, now), 410);
  });
});

describe("assertContiguous", () => {
  it("accepts 0..n-1 in any order", () => {
    expect(() => assertContiguous([2, 0, 1])).not.toThrow();
    expect(() => assertContiguous([0])).not.toThrow();
  });
  it("rejects a missing index", () => fails(() => assertContiguous([0, 1, 3]), 400));
  it("rejects one that doesn't start at 0", () => fails(() => assertContiguous([1, 2]), 400));
  it("rejects duplicates", () => fails(() => assertContiguous([0, 1, 1]), 400));
  it("rejects an empty list", () => fails(() => assertContiguous([]), 400));
  it("enforces the announced count", () => {
    expect(() => assertContiguous([0, 1], 2)).not.toThrow();
    fails(() => assertContiguous([0, 1], 3), 400);
  });
  it("caps the number of chunks", () => {
    fails(() => assertContiguous(Array.from({ length: MAX_CHUNKS + 1 }, (_, i) => i)), 400);
  });
});

describe("misc rules", () => {
  it("parseChunkIndex", () => {
    expect(parseChunkIndex("0")).toBe(0);
    expect(parseChunkIndex(7)).toBe(7);
    for (const bad of ["-1", "1.5", "abc", "", null, undefined, MAX_CHUNKS, NaN]) fails(() => parseChunkIndex(bad), 400);
  });

  it("assertSizeMatches", () => {
    expect(() => assertSizeMatches(10, undefined)).not.toThrow();
    expect(() => assertSizeMatches(10, 10)).not.toThrow();
    fails(() => assertSizeMatches(10, 11), 400);
    fails(() => assertSizeMatches(10, "10"), 400);
  });

  it("toChunkRefs orders by index and maps expiry", () => {
    const at = new Date("2026-01-01T00:00:00Z");
    const refs = toChunkRefs([
      { index: 1, size: 2, messageId: "m1", attachmentId: "a1", url: "u1", urlExpiresAt: null },
      { index: 0, size: 1, messageId: "m0", attachmentId: "a0", url: "u0", urlExpiresAt: at },
    ]);
    expect(refs.map((r) => r.index)).toEqual([0, 1]);
    expect(refs[0]!.expiresAt).toBe(at.getTime());
    expect(refs[1]!.expiresAt).toBe(0);
  });
});

// ── The SSRF scenarios ───────────────────────────────────────────────────────

const MSG = "111111111111111111";
const ATT = "222222222222222222";
const goodMessage = (over: Partial<DiscordMessage["attachments"][0]> = {}): DiscordMessage => ({
  id: MSG,
  channel_id: "1",
  timestamp: "",
  attachments: [{ id: ATT, filename: "f", size: 1234, proxy_url: "", url: "https://cdn.discordapp.com/attachments/1/2/f?ex=65000000", ...over }],
});

describe("resolveLegacyChunks (client-supplied chunks[] is never trusted)", () => {
  it("ignores the client's url / size / expiresAt and uses Discord's answer", async () => {
    const client = { getMessage: vi.fn().mockResolvedValue(goodMessage()) };
    const refs = await resolveLegacyChunks(client, [
      // @ts-expect-error — extra fields are what a hostile client would send
      { index: 0, messageId: MSG, attachmentId: ATT, url: "http://169.254.169.254/latest/meta-data/", size: 999999, expiresAt: 9e15 },
    ]);
    expect(refs).toHaveLength(1);
    expect(refs[0]!.url).toBe("https://cdn.discordapp.com/attachments/1/2/f?ex=65000000");
    expect(refs[0]!.size).toBe(1234);
    expect(refs[0]!.expiresAt).toBe(parseInt("65000000", 16) * 1000);
    expect(client.getMessage).toHaveBeenCalledWith(MSG);
  });

  it("rejects a messageId that doesn't exist on THIS webhook (other drive's message)", async () => {
    const client = { getMessage: vi.fn().mockResolvedValue(null) };
    await expect(resolveLegacyChunks(client, [{ index: 0, messageId: MSG, attachmentId: ATT }])).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an attachmentId that isn't part of that message", async () => {
    const client = { getMessage: vi.fn().mockResolvedValue(goodMessage({ id: "333333333333333333" })) };
    await expect(resolveLegacyChunks(client, [{ index: 0, messageId: MSG, attachmentId: ATT }])).rejects.toMatchObject({ status: 400 });
  });

  it("rejects when Discord itself returns a non-CDN url", async () => {
    const client = { getMessage: vi.fn().mockResolvedValue(goodMessage({ url: "https://evil.example/x" })) };
    await expect(resolveLegacyChunks(client, [{ index: 0, messageId: MSG, attachmentId: ATT }])).rejects.toMatchObject({ status: 400 });
  });

  it.each([
    ["path traversal in messageId", { index: 0, messageId: "../../webhooks/1/tok", attachmentId: ATT }],
    ["non-numeric attachmentId", { index: 0, messageId: MSG, attachmentId: "abc" }],
    ["missing ids", { index: 0 }],
    ["negative index", { index: -1, messageId: MSG, attachmentId: ATT }],
  ])("never queries Discord for malformed input: %s", async (_label, chunk) => {
    const client = { getMessage: vi.fn() };
    await expect(resolveLegacyChunks(client, [chunk])).rejects.toBeInstanceOf(UploadError);
    expect(client.getMessage).not.toHaveBeenCalled();
  });

  it("rejects a missing index (gap) without querying Discord", async () => {
    const client = { getMessage: vi.fn() };
    await expect(
      resolveLegacyChunks(client, [
        { index: 0, messageId: MSG, attachmentId: ATT },
        { index: 2, messageId: "444444444444444444", attachmentId: ATT },
      ]),
    ).rejects.toMatchObject({ status: 400 });
    expect(client.getMessage).not.toHaveBeenCalled();
  });

  it("rejects the same message referenced twice", async () => {
    const client = { getMessage: vi.fn() };
    await expect(
      resolveLegacyChunks(client, [
        { index: 0, messageId: MSG, attachmentId: ATT },
        { index: 1, messageId: MSG, attachmentId: ATT },
      ]),
    ).rejects.toMatchObject({ status: 400 });
  });
});
