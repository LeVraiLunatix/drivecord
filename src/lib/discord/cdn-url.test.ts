import { describe, expect, it, vi } from "vitest";
import { assertDiscordCdnUrl, CdnUrlError, fetchDiscordCdn, isDiscordCdnUrl } from "./cdn-url";

describe("isDiscordCdnUrl", () => {
  it("accepts the two CDN hosts over https", () => {
    expect(isDiscordCdnUrl("https://cdn.discordapp.com/attachments/1/2/f.bin?ex=1&is=2&hm=3")).toBe(true);
    expect(isDiscordCdnUrl("https://media.discordapp.net/attachments/1/2/f.bin")).toBe(true);
  });

  it.each([
    "http://cdn.discordapp.com/x",
    "https://169.254.169.254/latest/meta-data/",
    "http://localhost:3000/admin",
    "https://127.0.0.1/",
    "https://cdn.discordapp.com.evil.example/x",
    "https://evil.example/cdn.discordapp.com/x",
    "https://cdn.discordapp.com@evil.example/x",
    "https://user:pw@cdn.discordapp.com/x",
    "https://cdn.discordapp.com:8443/x",
    "https://discord.com/api/v10/webhooks/1/abc",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "//cdn.discordapp.com/x",
    "",
    "not a url",
  ])("rejects %s", (url) => {
    expect(isDiscordCdnUrl(url)).toBe(false);
  });

  it("rejects non-strings and absurdly long urls", () => {
    expect(isDiscordCdnUrl(undefined)).toBe(false);
    expect(isDiscordCdnUrl(42)).toBe(false);
    expect(isDiscordCdnUrl(`https://cdn.discordapp.com/${"a".repeat(3000)}`)).toBe(false);
  });

  it("assert throws CdnUrlError", () => {
    expect(() => assertDiscordCdnUrl("https://evil.example/")).toThrow(CdnUrlError);
  });
});

describe("fetchDiscordCdn", () => {
  it("never calls fetch for a forbidden url", async () => {
    const f = vi.fn();
    await expect(fetchDiscordCdn("http://169.254.169.254/", {}, f as unknown as typeof fetch)).rejects.toThrow(CdnUrlError);
    expect(f).not.toHaveBeenCalled();
  });

  it("follows a redirect to another allowed host", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "https://media.discordapp.net/y" } }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));
    const res = await fetchDiscordCdn("https://cdn.discordapp.com/x", {}, f as unknown as typeof fetch);
    expect(res.status).toBe(200);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0]![1]).toMatchObject({ redirect: "manual" });
  });

  it("refuses a redirect to a forbidden host", async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "http://169.254.169.254/" } }));
    await expect(fetchDiscordCdn("https://cdn.discordapp.com/x", {}, f as unknown as typeof fetch)).rejects.toThrow(CdnUrlError);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("gives up after too many redirects", async () => {
    const f = vi.fn().mockImplementation(async () => new Response(null, { status: 302, headers: { location: "https://cdn.discordapp.com/loop" } }));
    await expect(fetchDiscordCdn("https://cdn.discordapp.com/x", {}, f as unknown as typeof fetch)).rejects.toThrow(/redirections/);
  });
});
