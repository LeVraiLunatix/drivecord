/**
 * Frozen test vectors: these pin the on-disk / on-wire formats. If one of them
 * changes, every existing ciphertext becomes unreadable — that's a format
 * break, never a "fix the test" situation.
 *
 * Regenerate (deliberately, for a NEW format version) with:
 *   UPDATE_VECTORS=1 npx vitest run src/lib/crypto/e2ee/__tests__/vectors.test.ts
 */
import { describe, expect, it } from "vitest";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nacl from "tweetnacl";
import {
  aad,
  b64decode,
  b64encode,
  base32Encode,
  chunkIv,
  deriveKekFromPhrase,
  encryptChunk,
  hexDecode,
  hexEncode,
  hkdf,
  importAesKey,
  approvalCommitment,
  sasCode,
  wrap,
  type PhraseKdf,
} from "..";

const FILE = fileURLToPath(new URL("./vectors.json", import.meta.url));
const seq = (start: number, n: number) => Uint8Array.from({ length: n }, (_, i) => (start + i) & 255);
const text = (s: string) => new TextEncoder().encode(s);

async function compute() {
  const fk = seq(1, 32);
  const prefix = seq(0xa0, 7);
  const fileKey = await importAesKey(fk);
  const p = { fk: fileKey, noncePrefix: prefix, fileId: "file_vector_1" };
  const kdf: PhraseKdf = { alg: "argon2id", m: 64, t: 2, p: 1, salt: b64encode(seq(0x10, 16)) };
  const kek = await importAesKey(seq(0x40, 32));
  const secretA = seq(0x50, 32);

  return {
    _comment: "Frozen vectors for e2ee format v1. See vectors.test.ts.",
    chunkIv: {
      prefix: hexEncode(prefix),
      first: hexEncode(chunkIv(prefix, 0, false)),
      firstLast: hexEncode(chunkIv(prefix, 0, true)),
      i258: hexEncode(chunkIv(prefix, 258, false)),
    },
    chunk: {
      fk: hexEncode(fk),
      noncePrefix: hexEncode(prefix),
      fileId: p.fileId,
      index: 0,
      last: true,
      plain: hexEncode(text("Bonjour Drivecord — chiffrement de bout en bout")),
      cipher: hexEncode(await encryptChunk(p, 0, true, text("Bonjour Drivecord — chiffrement de bout en bout"))),
      notLast: hexEncode(await encryptChunk(p, 0, false, text("Bonjour Drivecord — chiffrement de bout en bout"))),
      emptyFile: hexEncode(await encryptChunk(p, 0, true, new Uint8Array(0))),
    },
    wrap: {
      kek: hexEncode(seq(0x40, 32)),
      iv: hexEncode(seq(0x90, 12)),
      context: aad.dk("drive_1"),
      secret: hexEncode(seq(0x20, 32)),
      blob: await wrap(kek, seq(0x20, 32), aad.dk("drive_1"), seq(0x90, 12)),
    },
    aad: {
      mk: aad.mk("u"), dk: aad.dk("d"), fk: aad.fk("f"), chunk: aad.chunk("f", 3),
      meta: aad.meta("f"), folder: aad.folder("x"),
    },
    hkdf: { ikm: hexEncode(seq(0, 32)), info: "drivecord:kek:recovery:v1", okm: hexEncode(await hkdf(seq(0, 32), "drivecord:kek:recovery:v1")) },
    argon2id: {
      phrase: "correct horse battery staple",
      kdf,
      // The KEK is non-extractable; pin it through what it produces.
      sealed: await wrap(await deriveKekFromPhrase("correct horse battery staple", kdf), seq(0, 32), "vector", seq(0, 12)),
    },
    base32: { in: hexEncode(seq(0, 32)), out: base32Encode(seq(0, 32)) },
    sas: {
      pub: hexEncode(nacl.box.keyPair.fromSecretKey(secretA).publicKey),
      r1: hexEncode(seq(0xc0, 16)),
      r2: hexEncode(seq(0xd0, 16)),
      commitment: await approvalCommitment(nacl.box.keyPair.fromSecretKey(secretA).publicKey, seq(0xc0, 16)),
      code: await sasCode(seq(0xc0, 16), seq(0xd0, 16), nacl.box.keyPair.fromSecretKey(secretA).publicKey),
    },
  };
}

describe("frozen vectors (format v1)", () => {
  it("match vectors.json", async () => {
    const now = await compute();
    if (process.env.UPDATE_VECTORS) {
      writeFileSync(FILE, JSON.stringify(now, null, 2) + "\n");
      return;
    }
    const frozen = JSON.parse(readFileSync(FILE, "utf8"));
    expect(now).toEqual(frozen);
  });

  it("a frozen ciphertext still decrypts (independent of the generator)", async () => {
    const frozen = JSON.parse(readFileSync(FILE, "utf8"));
    const { decryptChunk } = await import("..");
    const p = { fk: await importAesKey(hexDecode(frozen.chunk.fk)), noncePrefix: hexDecode(frozen.chunk.noncePrefix), fileId: frozen.chunk.fileId };
    const plain = await decryptChunk(p, 0, true, hexDecode(frozen.chunk.cipher));
    expect(hexEncode(plain)).toBe(frozen.chunk.plain);
    await expect(decryptChunk(p, 0, false, hexDecode(frozen.chunk.cipher))).rejects.toThrow(); // lastFlag is authenticated
    expect(b64decode(frozen.wrap.blob.split(".")[1])).toHaveLength(12);
  });
});
