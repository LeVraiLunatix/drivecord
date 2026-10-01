/**
 * Key derivation.
 *  - phrase      → Argon2id (hash-wasm), parameters stored with the blob so they can be raised later
 *  - recovery    → 256-bit random key, shown once as base32 groups
 *  - passkey PRF → HKDF-SHA256 over the authenticator's PRF output
 */
import { argon2id } from "hash-wasm";
import { b64decode, b64encode, bs, enc, randomBytes } from "./encoding";
import { importAesKey } from "./wrap";

export type PhraseKdf = { alg: "argon2id"; m: number; t: number; p: number; salt: string };

/** m = 64 MiB, t = 3, p = 1, 16-byte random salt. */
export const DEFAULT_PHRASE_KDF = { alg: "argon2id", m: 65536, t: 3, p: 1 } as const;

export function newPhraseKdf(): PhraseKdf {
  return { ...DEFAULT_PHRASE_KDF, salt: b64encode(randomBytes(16)) };
}

/** Phrases are NFKC-normalised so the same words typed on another keyboard derive the same key. */
export function normalizePhrase(phrase: string): string {
  return phrase.normalize("NFKC").trim().replace(/\s+/g, " ");
}

/** Raw Argon2id output (32 bytes) for a secret + stored parameters. */
export async function deriveRawFromSecret(secret: string, kdf: PhraseKdf): Promise<Uint8Array> {
  if (kdf.alg !== "argon2id") throw new Error("KDF inconnue.");
  // Refuse absurd parameters coming from a (possibly hostile) server: a DoS by memory.
  if (kdf.m > 1024 * 1024 || kdf.t > 20 || kdf.p > 8 || kdf.m < 8) throw new Error("Paramètres KDF refusés.");
  return argon2id({
    password: normalizePhrase(secret),
    salt: b64decode(kdf.salt),
    parallelism: kdf.p,
    iterations: kdf.t,
    memorySize: kdf.m,
    hashLength: 32,
    outputType: "binary",
  });
}

export async function deriveKekFromPhrase(phrase: string, kdf: PhraseKdf): Promise<CryptoKey> {
  return importAesKey(await deriveRawFromSecret(phrase, kdf));
}

export async function hkdf(ikm: Uint8Array, info: string, salt: Uint8Array = new Uint8Array(32), length = 32): Promise<Uint8Array> {
  const base = await crypto.subtle.importKey("raw", bs(ikm), "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: bs(salt), info: bs(enc.encode(info)) }, base, length * 8);
  return new Uint8Array(bits);
}

export async function kekFromHkdf(ikm: Uint8Array, info: string): Promise<CryptoKey> {
  return importAesKey(await hkdf(ikm, info));
}

// ── Recovery key ─────────────────────────────────────────────────────────────

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str: string): Uint8Array {
  const clean = str.toUpperCase().replace(/[\s-]/g, "");
  if (!/^[A-Z2-7]*$/.test(clean)) throw new Error("Clé de récupération invalide.");
  const out: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch);
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

/** 32 random bytes; displayed as 13 groups of 4 base32 characters. */
export function generateRecoveryKey(): { bytes: Uint8Array; display: string; groups: string[] } {
  const bytes = randomBytes(32);
  const groups = base32Encode(bytes).match(/.{1,4}/g)!;
  return { bytes, display: groups.join("-"), groups };
}

export function parseRecoveryKey(input: string): Uint8Array {
  const bytes = base32Decode(input);
  if (bytes.length !== 32) throw new Error("Clé de récupération invalide (longueur).");
  return bytes;
}

export const recoveryKek = (bytes: Uint8Array) => kekFromHkdf(bytes, "drivecord:kek:recovery:v1");
export const passkeyKek = (prfOutput: Uint8Array) => kekFromHkdf(prfOutput, "drivecord:kek:passkey:v1");

/** Fixed PRF salt from the spec (`"drivecord-mk-v1"`), as bytes. */
export const PRF_SALT = enc.encode("drivecord-mk-v1");
