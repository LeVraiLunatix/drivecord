import { describe, expect, it } from "vitest";
import { parseEmbedMessage, parseHostMessage } from "./protocol";

describe("embed protocol", () => {
  it("accepts well-formed messages and strips unknown fields", () => {
    const m = parseEmbedMessage({ v: 1, source: "drivecord-embed", type: "uploaded", fileId: "abc", size: 12, name: "secret.pdf", url: "https://x" });
    expect(m).toEqual({ v: 1, source: "drivecord-embed", type: "uploaded", fileId: "abc", size: 12 });
  });
  it("rejects wrong version, source, type or shape", () => {
    expect(parseEmbedMessage({ v: 2, source: "drivecord-embed", type: "ready" })).toBeNull();
    expect(parseEmbedMessage({ v: 1, source: "evil", type: "ready" })).toBeNull();
    expect(parseEmbedMessage({ v: 1, source: "drivecord-embed", type: "explode" })).toBeNull();
    expect(parseEmbedMessage({ v: 1, source: "drivecord-embed", type: "uploaded", fileId: 3, size: 1 })).toBeNull();
    expect(parseEmbedMessage("hi")).toBeNull();
    expect(parseEmbedMessage(null)).toBeNull();
  });
  it("clamps progress and bounds resize", () => {
    expect((parseEmbedMessage({ v: 1, source: "drivecord-embed", type: "progress", fileId: "a", percent: 900 }) as { percent: number }).percent).toBe(100);
    expect(parseEmbedMessage({ v: 1, source: "drivecord-embed", type: "resize", height: 99999 })).toBeNull();
  });
  it("host init: only safe accept strings pass", () => {
    expect(parseHostMessage({ v: 1, source: "drivecord-host", type: "init", options: { accept: "image/*,.pdf" } })?.options.accept).toBe("image/*,.pdf");
    expect(parseHostMessage({ v: 1, source: "drivecord-host", type: "init", options: { accept: "<script>" } })?.options.accept).toBeUndefined();
    expect(parseHostMessage({ v: 1, source: "x", type: "init" })).toBeNull();
  });
});
