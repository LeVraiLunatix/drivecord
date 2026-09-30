/**
 * Chunked file encryption, format v1.
 *
 *  - FK: 32 random bytes per file; `noncePrefix`: 7 random bytes per file.
 *  - Plaintext is cut in 8 MiB chunks (the last one may be shorter, and may be
 *    empty only for an empty file). Each chunk becomes 8 MiB + 16 bytes of
 *    ciphertext: under Discord's 10 MiB attachment limit, one chunk = one attachment.
 *  - IV(i)  = noncePrefix (7) ‖ uint32_be(i) (4) ‖ lastFlag (1: 0x01 only on the final chunk)
 *  - AAD(i) = "drivecord:chunk:v1:" + fileId + ":" + i
 *
 * Consequences, all enforced by AES-GCM authentication (and tested):
 *  - reordering chunks fails   (index in IV and AAD)
 *  - swapping chunks between files fails (fileId in AAD, different prefix)
 *  - truncating the file fails (the new last chunk was not sealed with lastFlag = 1)
 *  - appending a chunk fails   (the old last chunk was sealed with lastFlag = 1)
 */
import { bs, concat } from "./encoding";
import { aad, aesDecrypt, aesEncrypt } from "./wrap";

export const CHUNK_PLAIN = 8 * 1024 * 1024;
export const TAG_LEN = 16;
export const CHUNK_CIPHER = CHUNK_PLAIN + TAG_LEN;
export const NONCE_PREFIX_LEN = 7;
/** A file can't have more chunks than the uint32 counter — and we cap far lower. */
export const MAX_FILE_CHUNKS = 10_000;

export function chunkIv(prefix: Uint8Array, index: number, last: boolean): Uint8Array {
  if (prefix.length !== NONCE_PREFIX_LEN) throw new Error("noncePrefix de 7 octets attendu.");
  if (!Number.isInteger(index) || index < 0 || index >= MAX_FILE_CHUNKS) throw new Error("Index de chunk invalide.");
  const iv = new Uint8Array(12);
  iv.set(prefix, 0);
  new DataView(iv.buffer).setUint32(7, index, false);
  iv[11] = last ? 1 : 0;
  return iv;
}

export type FileCipherParams = { fk: CryptoKey; noncePrefix: Uint8Array; fileId: string };

export function encryptChunk(p: FileCipherParams, index: number, last: boolean, plain: Uint8Array): Promise<Uint8Array> {
  if (plain.length > CHUNK_PLAIN) throw new Error("Chunk trop grand.");
  return aesEncrypt(p.fk, chunkIv(p.noncePrefix, index, last), plain, aad.chunk(p.fileId, index));
}

export function decryptChunk(p: FileCipherParams, index: number, last: boolean, cipher: Uint8Array): Promise<Uint8Array> {
  if (cipher.length < TAG_LEN || cipher.length > CHUNK_CIPHER) throw new Error("Chunk chiffré de taille invalide.");
  return aesDecrypt(p.fk, chunkIv(p.noncePrefix, index, last), cipher, aad.chunk(p.fileId, index));
}

/** Ciphertext length for a plaintext of `size` bytes. */
export function cipherSize(size: number): number {
  return size + TAG_LEN * Math.max(1, Math.ceil(size / CHUNK_PLAIN));
}

/** Plaintext length for a ciphertext of `size` bytes (throws if `size` can't be a valid ciphertext). */
export function plainSize(size: number): number {
  const chunks = Math.max(1, Math.ceil(size / CHUNK_CIPHER));
  const plain = size - TAG_LEN * chunks;
  if (plain < 0 || cipherSize(plain) !== size) throw new Error("Taille chiffrée incohérente.");
  return plain;
}

/**
 * Encrypt a Blob, yielding one ciphertext chunk at a time (so callers can ship
 * each to Discord and drop it — memory stays at about one chunk).
 */
export async function* encryptBlobChunks(blob: Blob, p: FileCipherParams): AsyncGenerator<Uint8Array> {
  const total = Math.max(1, Math.ceil(blob.size / CHUNK_PLAIN));
  if (total > MAX_FILE_CHUNKS) throw new Error("Fichier trop volumineux.");
  for (let i = 0; i < total; i++) {
    const plain = new Uint8Array(await blob.slice(i * CHUNK_PLAIN, (i + 1) * CHUNK_PLAIN).arrayBuffer());
    yield await encryptChunk(p, i, i === total - 1, plain);
  }
}

/**
 * Decrypt chunks supplied in order (one ciphertext chunk each). The final one
 * is identified by the end of the iterable — which is how truncation shows up.
 */
export async function* decryptChunks(
  chunks: AsyncIterable<Uint8Array> | Iterable<Uint8Array>,
  p: FileCipherParams,
): AsyncGenerator<Uint8Array> {
  let prev: Uint8Array | null = null;
  let index = 0;
  for await (const c of chunks as AsyncIterable<Uint8Array>) {
    if (prev) yield await decryptChunk(p, index++, false, prev);
    prev = c;
  }
  if (!prev) throw new Error("Fichier chiffré vide.");
  yield await decryptChunk(p, index, true, prev);
}

/** Decrypt a whole ciphertext Blob (the concatenated attachments of a file). */
export async function decryptBlob(blob: Blob, p: FileCipherParams, type = ""): Promise<Blob> {
  plainSize(blob.size); // reject impossible sizes before doing any work
  const total = Math.max(1, Math.ceil(blob.size / CHUNK_CIPHER));
  const parts: Uint8Array[] = [];
  for (let i = 0; i < total; i++) {
    const cipher = new Uint8Array(await blob.slice(i * CHUNK_CIPHER, (i + 1) * CHUNK_CIPHER).arrayBuffer());
    parts.push(await decryptChunk(p, i, i === total - 1, cipher));
  }
  return new Blob(parts.map(bs), { type });
}

// ── TransformStream flavours ─────────────────────────────────────────────────

/** Byte stream in → ciphertext chunks out (one `Uint8Array` per encrypted chunk). */
export function createEncryptTransform(p: FileCipherParams): TransformStream<Uint8Array, Uint8Array> {
  let buf: Uint8Array = new Uint8Array(0);
  let index = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(part, controller) {
      buf = buf.length ? concat(buf, part) : part;
      // Keep ≥ 1 byte back: we can't know a chunk isn't the last one until more data arrives.
      while (buf.length > CHUNK_PLAIN) {
        controller.enqueue(await encryptChunk(p, index++, false, buf.subarray(0, CHUNK_PLAIN)));
        buf = buf.subarray(CHUNK_PLAIN);
      }
    },
    async flush(controller) {
      controller.enqueue(await encryptChunk(p, index, true, buf));
    },
  });
}

/** Ciphertext byte stream in → plaintext chunks out. */
export function createDecryptTransform(p: FileCipherParams): TransformStream<Uint8Array, Uint8Array> {
  let buf: Uint8Array = new Uint8Array(0);
  let index = 0;
  return new TransformStream<Uint8Array, Uint8Array>({
    async transform(part, controller) {
      buf = buf.length ? concat(buf, part) : part;
      while (buf.length > CHUNK_CIPHER) {
        controller.enqueue(await decryptChunk(p, index++, false, buf.subarray(0, CHUNK_CIPHER)));
        buf = buf.subarray(CHUNK_CIPHER);
      }
    },
    async flush(controller) {
      if (buf.length === 0 && index === 0) throw new Error("Fichier chiffré vide.");
      controller.enqueue(await decryptChunk(p, index, true, buf));
    },
  });
}
