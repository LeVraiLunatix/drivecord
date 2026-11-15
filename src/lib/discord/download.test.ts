import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadChunks } from "./download";
import type { ChunkRef } from "./types";

const chunk = (index: number, size: number): ChunkRef => ({
  index, size, messageId: "1", attachmentId: "2", expiresAt: 0,
  url: `https://cdn.discordapp.com/attachments/1/2/c${index}`,
});

/** Chunk i answers with `sizes[i]` bytes of value i, later chunks faster than earlier ones. */
function mockFetch(sizes: number[]) {
  vi.stubGlobal("fetch", async (url: string) => {
    const i = Number(/c(\d+)/.exec(decodeURIComponent(url))![1]);
    await new Promise((r) => setTimeout(r, (sizes.length - i) * 5));
    return new Response(new Uint8Array(sizes[i]!).fill(i));
  });
}

afterEach(() => vi.unstubAllGlobals());

describe("downloadChunks", () => {
  it("hands chunks over in order even when they finish out of order", async () => {
    mockFetch([3, 4, 5, 6, 7]);
    const seen: number[] = [];
    await downloadChunks([3, 4, 5, 6, 7].map((s, i) => chunk(i, s)), async (b, pos) => {
      seen.push(pos * 100 + b.size);
    }, { parallel: 3 });
    expect(seen).toEqual([3, 104, 205, 306, 407]);
  });

  it("rejects a truncated chunk instead of saving a corrupt file", async () => {
    mockFetch([3, 2]); // chunk 1 is declared 4 bytes but only 2 arrive
    await expect(
      downloadChunks([chunk(0, 3), chunk(1, 4)], async () => {}, { parallel: 2 }),
    ).rejects.toThrow(/incomplet/);
  }, 20_000);

  it("stops when the writer fails", async () => {
    mockFetch([1, 1, 1]);
    await expect(
      downloadChunks([0, 1, 2].map((i) => chunk(i, 1)), async () => { throw new Error("disque plein"); }),
    ).rejects.toThrow("disque plein");
  });
});
