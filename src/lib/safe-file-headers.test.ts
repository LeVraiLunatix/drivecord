import { describe, expect, it } from "vitest";
import { buildSafeFileHeaders, contentDisposition, isInlineSafe } from "./safe-file-headers";
import { detectMime } from "./detect-mime";

const file = (mimeType: string, filename = "f.bin") => ({ filename, mimeType, size: 3 });

describe("inline allowlist", () => {
  it.each(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif", "video/mp4", "video/webm",
    "video/quicktime", "audio/mpeg", "audio/ogg", "application/pdf", "IMAGE/PNG", "image/png; charset=x"])(
    "%s may be inline", (m) => expect(isInlineSafe(m)).toBe(true));

  it.each(["image/svg+xml", "text/html", "application/xhtml+xml", "text/xml", "application/xml",
    "application/javascript", "text/javascript", "text/plain", "application/octet-stream", "audio/*", "audio/",
    "", "image/svg+xml; charset=utf-8", "text/html;image/png"])(
    "%s may NOT be inline", (m) => expect(isInlineSafe(m)).toBe(false));
});

describe("buildSafeFileHeaders", () => {
  it("serves HTML as an octet-stream attachment even when inline is requested", () => {
    const h = buildSafeFileHeaders(file("text/html", "x.html"), { disposition: "inline", isPublic: true });
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toMatch(/^attachment;/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toContain("sandbox");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("does the same for SVG", () => {
    const h = buildSafeFileHeaders(file("image/svg+xml", "x.svg"), { disposition: "inline", isPublic: true });
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toMatch(/^attachment;/);
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("serves a PNG inline with nosniff; public media may be framed", () => {
    const h = buildSafeFileHeaders(file("image/png", "a.png"), { disposition: "inline", isPublic: true });
    expect(h["Content-Type"]).toBe("image/png");
    expect(h["Content-Disposition"]).toMatch(/^inline;/);
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Content-Security-Policy"]).toBe("default-src 'none'; sandbox; frame-ancestors *");
    expect(h["Cross-Origin-Resource-Policy"]).toBe("cross-origin");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
  });

  it("private (non-public) responses are same-origin and never framable", () => {
    const h = buildSafeFileHeaders(file("image/png"), { disposition: "inline" });
    expect(h["Cross-Origin-Resource-Policy"]).toBe("same-origin");
    expect(h["Content-Security-Policy"]).toContain("frame-ancestors 'none'");
  });

  it("a PDF is inline but keeps the viewer working (no sandbox), never framable", () => {
    const h = buildSafeFileHeaders(file("application/pdf"), { disposition: "inline", isPublic: true });
    expect(h["Content-Disposition"]).toMatch(/^inline;/);
    expect(h["Content-Security-Policy"]).toBe("default-src 'none'; frame-ancestors 'none'");
  });

  it("an explicit attachment stays an attachment", () => {
    expect(buildSafeFileHeaders(file("image/png"), { disposition: "attachment" })["Content-Disposition"]).toMatch(/^attachment;/);
  });

  it("garbage content types collapse to octet-stream", () => {
    expect(buildSafeFileHeaders(file("x\r\nSet-Cookie: a=b"), { disposition: "inline" })["Content-Type"]).toBe("application/octet-stream");
  });
});

describe("contentDisposition", () => {
  it("resists header injection and handles unicode", () => {
    const h = contentDisposition('evil"\r\nX-Injected: 1.txt', "attachment");
    expect(h).not.toMatch(/[\r\n]/);
    expect(h).not.toContain('evil"');
    expect(contentDisposition("résumé (1).pdf", "inline")).toMatch(/filename\*=UTF-8''r%C3%A9sum%C3%A9%20%281%29\.pdf$/);
  });
});

describe("detectMime", () => {
  const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);
  it("content wins over a lying announced type", async () => {
    expect(await detectMime(png, "text/html")).toBe("image/png");
  });
  it("unknown content keeps a well-formed announced type", async () => {
    expect(await detectMime(new TextEncoder().encode("hello"), "text/plain; charset=utf-8")).toBe("text/plain");
  });
  it("unknown content + bogus announced type → octet-stream", async () => {
    expect(await detectMime(new TextEncoder().encode("hello"), "nope")).toBe("application/octet-stream");
    expect(await detectMime(new TextEncoder().encode("hello"), undefined)).toBe("application/octet-stream");
  });
});
