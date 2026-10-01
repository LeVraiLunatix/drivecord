import { describe, expect, it } from "vitest";
import {
  CHUNK_CIPHER,
  CHUNK_PLAIN,
  TAG_LEN,
  chunkIv,
  cipherSize,
  createDecryptTransform,
  createEncryptTransform,
  decryptBlob,
  decryptChunks,
  encryptBlobChunks,
  importAesKey,
  plainSize,
  randomBytes,
  concat,
  bytesEqual,
  type FileCipherParams,
} from "..";

async function params(fileId = "file_A"): Promise<FileCipherParams> {
  return { fk: await importAesKey(randomBytes(32)), noncePrefix: randomBytes(7), fileId };
}

// NB: never `toEqual` on multi-MiB typed arrays — vitest's differ explodes on them.
const same = (a: Uint8Array, b: Uint8Array) => expect(bytesEqual(a, b)).toBe(true);

const filled = (n: number) => {
  const b = new Uint8Array(n);
  for (let i = 0; i < n; i += 4099) b[i] = (i / 4099) & 255;
  return b;
};

async function encryptAll(data: Uint8Array, p: FileCipherParams): Promise<Uint8Array[]> {
  const out: Uint8Array[] = [];
  for await (const c of encryptBlobChunks(new Blob([data as BlobPart]), p)) out.push(c);
  return out;
}

async function decryptAll(chunks: Uint8Array[], p: FileCipherParams): Promise<Uint8Array> {
  const out: Uint8Array[] = [];
  for await (const c of decryptChunks(chunks, p)) out.push(c);
  return concat(...out);
}

describe("round trip", () => {
  it.each([0, 1, 100, CHUNK_PLAIN - 1, CHUNK_PLAIN, CHUNK_PLAIN + 1, 2 * CHUNK_PLAIN, 2 * CHUNK_PLAIN + 5])(
    "size %i",
    async (size) => {
      const p = await params();
      const data = filled(size);
      const chunks = await encryptAll(data, p);
      expect(chunks.length).toBe(Math.max(1, Math.ceil(size / CHUNK_PLAIN)));
      expect(chunks.reduce((n, c) => n + c.length, 0)).toBe(cipherSize(size));
      for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK_CIPHER);
      expect(plainSize(cipherSize(size))).toBe(size);
      same(await decryptAll(chunks, p), data);
      // The Blob flavour (all attachments concatenated) agrees.
      const blob = await decryptBlob(new Blob(chunks as BlobPart[]), p);
      same(new Uint8Array(await blob.arrayBuffer()), data);
    },
    30_000,
  );

  it("a chunk stays under Discord's 10 MiB attachment limit", () => {
    expect(CHUNK_CIPHER).toBeLessThan(10 * 1024 * 1024);
  });
});

describe("integrity — all enforced by AES-GCM", () => {
  it("rejects a flipped bit anywhere in a chunk", async () => {
    const p = await params();
    const [c] = await encryptAll(filled(1000), p);
    for (const pos of [0, 500, c!.length - 1]) {
      const bad = new Uint8Array(c!);
      bad[pos]! ^= 1;
      await expect(decryptAll([bad], p)).rejects.toThrow();
    }
  });

  it("rejects reordered chunks", async () => {
    const p = await params();
    const [a, b, c] = await encryptAll(filled(2 * CHUNK_PLAIN + 10), p);
    await expect(decryptAll([b!, a!, c!], p)).rejects.toThrow();
  });

  it("rejects chunks swapped between two files", async () => {
    const pa = await params("file_A");
    const pb = await params("file_B");
    const A = await encryptAll(filled(2 * CHUNK_PLAIN + 10), pa);
    const B = await encryptAll(filled(2 * CHUNK_PLAIN + 10), pb);
    await expect(decryptAll([A[0]!, B[1]!, A[2]!], pa)).rejects.toThrow();
  });

  it("rejects the same ciphertext under another fileId (wrong AAD)", async () => {
    const p = await params("file_A");
    const chunks = await encryptAll(filled(500), p);
    await expect(decryptAll(chunks, { ...p, fileId: "file_B" })).rejects.toThrow();
  });

  it("rejects truncation (last chunk dropped)", async () => {
    const p = await params();
    const [a, b] = await encryptAll(filled(2 * CHUNK_PLAIN), p);
    expect(await decryptAll([a!, b!], p)).toHaveLength(2 * CHUNK_PLAIN);
    await expect(decryptAll([a!], p)).rejects.toThrow();
  });

  it("rejects an appended chunk", async () => {
    const p = await params();
    const [a, b] = await encryptAll(filled(CHUNK_PLAIN + 7), p);
    await expect(decryptAll([a!, b!, b!], p)).rejects.toThrow();
  });

  it("rejects a wrong key and a wrong noncePrefix", async () => {
    const p = await params();
    const chunks = await encryptAll(filled(64), p);
    await expect(decryptAll(chunks, { ...p, fk: await importAesKey(randomBytes(32)) })).rejects.toThrow();
    await expect(decryptAll(chunks, { ...p, noncePrefix: randomBytes(7) })).rejects.toThrow();
  });

  it("rejects an empty ciphertext and impossible sizes", async () => {
    const p = await params();
    await expect(decryptAll([], p)).rejects.toThrow();
    expect(() => plainSize(5)).toThrow();
    expect(() => plainSize(CHUNK_CIPHER + 3)).toThrow();
    await expect(decryptBlob(new Blob([new Uint8Array(5)]), p)).rejects.toThrow();
  });

  it("never reuses an IV for different chunk positions or the last flag", () => {
    const prefix = new Uint8Array(7);
    const seen = new Set<string>();
    for (let i = 0; i < 50; i++) for (const last of [false, true]) seen.add(chunkIv(prefix, i, last).join(","));
    expect(seen.size).toBe(100);
    expect(() => chunkIv(new Uint8Array(6), 0, false)).toThrow();
    expect(() => chunkIv(prefix, -1, false)).toThrow();
    expect(() => chunkIv(prefix, 10_000, false)).toThrow();
  });

  it("two encryptions of the same data with fresh file keys differ", async () => {
    const data = filled(100);
    const a = await encryptAll(data, await params());
    const b = await encryptAll(data, await params());
    expect(bytesEqual(a[0]!, b[0]!)).toBe(false);
  });
});

describe("TransformStream flavours", () => {
  const pipe = async (input: Uint8Array, t: TransformStream<Uint8Array, Uint8Array>, step: number) => {
    const src = new ReadableStream<Uint8Array>({
      start(controller) {
        for (let i = 0; i < input.length; i += step) controller.enqueue(input.subarray(i, i + step));
        controller.close();
      },
    });
    const reader = src.pipeThrough(t).getReader();
    const out: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return out;
      out.push(value);
    }
  };

  it.each([0, 10, CHUNK_PLAIN, CHUNK_PLAIN + 1, 2 * CHUNK_PLAIN + 3])("encrypt→decrypt streams, size %i", async (size) => {
    const p = await params();
    const data = filled(size);
    const cipher = await pipe(data, createEncryptTransform(p), 3 * 1024 * 1024 + 17);
    // Encrypt transform output == the blob flavour's chunks.
    expect(cipher.length).toBe(Math.max(1, Math.ceil(size / CHUNK_PLAIN)));
    const plain = await pipe(concat(...cipher), createDecryptTransform(p), 5 * 1024 * 1024 + 1);
    same(concat(...plain), data);
  }, 30_000);

  it("decrypt stream rejects truncation", async () => {
    const p = await params();
    const cipher = await pipe(filled(2 * CHUNK_PLAIN), createEncryptTransform(p), CHUNK_PLAIN);
    await expect(pipe(cipher[0]!, createDecryptTransform(p), CHUNK_PLAIN)).rejects.toThrow();
  }, 30_000);
});

describe("constants", () => {
  it("are what the spec says", () => {
    expect(CHUNK_PLAIN).toBe(8 * 1024 * 1024);
    expect(TAG_LEN).toBe(16);
  });
});
