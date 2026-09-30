import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/encrypt", () => ({
  decryptUrl: () => "https://discord.com/api/webhooks/123456789012345678/tok",
}));

import { fetchAndDecryptFile } from "./serve-file";

const base = { encryptedWebhookUrl: "x", encKeyEncrypted: null, encIv: null, locked: false };
const chunk = (over: Record<string, unknown> = {}) => ({
  index: 0,
  size: 4,
  messageId: "111111111111111111",
  attachmentId: "222222222222222222",
  url: "https://cdn.discordapp.com/attachments/1/2/f?ex=ffffffff",
  // far in the future: the refresh-through-Discord step is skipped entirely
  expiresAt: Date.now() + 10 * 86_400_000,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("fetchAndDecryptFile — SSRF defence in depth", () => {
  it.each([
    "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
    "http://localhost:3000/api/admin/users",
    "https://127.0.0.1/",
    "https://cdn.discordapp.com.evil.example/x",
    "file:///etc/passwd",
  ])("never fetches a stored non-CDN url: %s", async (url) => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const res = await fetchAndDecryptFile({ ...base, chunks: [chunk({ url })] as never });
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(f).not.toHaveBeenCalled();
  });

  it("refuses ids that could be used for path traversal against the webhook API", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    const res = await fetchAndDecryptFile({
      ...base,
      chunks: [chunk({ messageId: "../../../webhooks/1/tok", expiresAt: 0 })] as never,
    });
    expect(res).toMatchObject({ ok: false, status: 502 });
    expect(f).not.toHaveBeenCalled();
  });

  it("does fetch a genuine CDN url", async () => {
    const f = vi.fn().mockResolvedValue(new Response("data", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const res = await fetchAndDecryptFile({ ...base, chunks: [chunk()] as never });
    expect(res.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
    expect(String(f.mock.calls[0]![0])).toMatch(/^https:\/\/cdn\.discordapp\.com\//);
  });

  it("ignores a refreshed url that points outside the CDN", async () => {
    const f = vi
      .fn()
      // message refresh answer with a poisoned attachment url
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ attachments: [{ id: "222222222222222222", url: "http://169.254.169.254/x" }] }), { status: 200 }),
      )
      .mockResolvedValueOnce(new Response("data", { status: 200 }));
    vi.stubGlobal("fetch", f);
    const res = await fetchAndDecryptFile({ ...base, chunks: [chunk({ expiresAt: 0 })] as never });
    expect(res.ok).toBe(true);
    for (const call of f.mock.calls.slice(1)) expect(String(call[0])).toMatch(/^https:\/\/cdn\.discordapp\.com\//);
  });

  it("vault files are never served", async () => {
    const res = await fetchAndDecryptFile({ ...base, locked: true, chunks: [chunk()] as never });
    expect(res).toMatchObject({ ok: false, status: 403 });
  });

  describe("end-to-end encrypted files are never decrypted server-side", () => {
    const ok = () => vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("CIPHERTEXT", { status: 200 })));

    it("cryptoVersion 1 → ciphertext returned as-is, even if a legacy key exists", async () => {
      ok();
      const res = await fetchAndDecryptFile({ ...base, encKeyEncrypted: "legacy-key-blob", cryptoVersion: 1, chunks: [chunk()] as never });
      expect(res).toMatchObject({ ok: true, encrypted: true });
      if (res.ok) expect(res.body.toString()).toBe("CIPHERTEXT");
    });

    it("legacy single-IV file on a drive migrated to E2EE → ciphertext, no 403, no decrypt attempt", async () => {
      ok();
      const res = await fetchAndDecryptFile({ ...base, encIv: "AAAAAAAAAAAAAAAA", encKeyEncrypted: null, e2eeVersion: 1, chunks: [chunk()] as never });
      expect(res).toMatchObject({ ok: true, encrypted: true });
    });

    it("a plaintext file is served as plaintext", async () => {
      ok();
      const res = await fetchAndDecryptFile({ ...base, chunks: [chunk()] as never });
      expect(res).toMatchObject({ ok: true, encrypted: false });
    });
  });
});
