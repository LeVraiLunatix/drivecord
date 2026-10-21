/**
 * Shamir secret sharing over GF(2^8) (AES polynomial), byte by byte.
 *
 * Used for "recovery shares": a random 256-bit secret wraps the Master Key, and the
 * secret is split into `n` shares of which any `k` rebuild it (fewer reveal nothing).
 * Shares are meant to be handed to trusted people, so they are text: version, k, x,
 * 32 bytes of y and a CRC-16 (typos are caught before anything is derived), in base32.
 */
import { base32Decode, base32Encode } from "./kdf";

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    // multiply by the generator 3: x ^ (x·2)
    let x2 = x << 1;
    if (x2 & 0x100) x2 ^= 0x11b;
    x ^= x2;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]!;
})();

const mul = (a: number, b: number) => (a === 0 || b === 0 ? 0 : EXP[LOG[a]! + LOG[b]!]!);
const div = (a: number, b: number) => {
  if (b === 0) throw new Error("Division par zéro.");
  return a === 0 ? 0 : EXP[LOG[a]! + 255 - LOG[b]!]!;
};

const SHARE_VERSION = 1;
export const SHARE_SECRET_LEN = 32;

export type RawShare = { k: number; x: number; y: Uint8Array };

/** Split `secret` into `n` shares, any `k` of which rebuild it. */
export function splitSecret(secret: Uint8Array, k: number, n: number): RawShare[] {
  if (!Number.isInteger(k) || !Number.isInteger(n) || k < 2 || n < k || n > 10) throw new Error("Paramètres de partage invalides.");
  const shares: RawShare[] = Array.from({ length: n }, (_, i) => ({ k, x: i + 1, y: new Uint8Array(secret.length) }));
  const coeffs = new Uint8Array(k);
  for (let b = 0; b < secret.length; b++) {
    coeffs[0] = secret[b]!;
    crypto.getRandomValues(coeffs.subarray(1));
    for (const s of shares) {
      // Horner evaluation at x
      let acc = 0;
      for (let d = k - 1; d >= 0; d--) acc = mul(acc, s.x) ^ coeffs[d]!;
      s.y[b] = acc;
    }
  }
  return shares;
}

/** Rebuild the secret from at least `k` distinct shares. */
export function combineShares(shares: RawShare[]): Uint8Array {
  const k = shares[0]?.k;
  if (!k) throw new Error("Aucune part fournie.");
  if (shares.some((s) => s.k !== k || s.y.length !== shares[0]!.y.length)) throw new Error("Ces parts ne viennent pas du même partage.");
  const distinct = [...new Map(shares.map((s) => [s.x, s])).values()];
  if (distinct.length < k) throw new Error(`Il faut ${k} parts différentes (${distinct.length} fournie${distinct.length > 1 ? "s" : ""}).`);
  const use = distinct.slice(0, k);
  const out = new Uint8Array(use[0]!.y.length);
  for (let b = 0; b < out.length; b++) {
    let acc = 0;
    for (const si of use) {
      let num = 1;
      let den = 1;
      for (const sj of use) {
        if (sj === si) continue;
        num = mul(num, sj.x);
        den = mul(den, si.x ^ sj.x);
      }
      acc ^= mul(si.y[b]!, div(num, den));
    }
    out[b] = acc;
  }
  return out;
}

function crc16(bytes: Uint8Array): number {
  let crc = 0xffff;
  for (const b of bytes) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc;
}

/** `XXXX-XXXX-…` text form of one share. */
export function encodeShare(s: RawShare): string {
  const body = new Uint8Array(3 + s.y.length);
  body.set([SHARE_VERSION, s.k, s.x]);
  body.set(s.y, 3);
  const full = new Uint8Array(body.length + 2);
  full.set(body);
  const crc = crc16(body);
  full.set([crc >> 8, crc & 255], body.length);
  return base32Encode(full).match(/.{1,4}/g)!.join("-");
}

export function decodeShare(text: string): RawShare {
  let bytes: Uint8Array;
  try {
    bytes = base32Decode(text);
  } catch {
    throw new Error("Part de récupération invalide.");
  }
  // base32 pads to a whole number of 5-bit groups: keep exactly the expected length.
  const expected = 3 + SHARE_SECRET_LEN + 2;
  if (bytes.length < expected) throw new Error("Part de récupération incomplète.");
  bytes = bytes.subarray(0, expected);
  const body = bytes.subarray(0, expected - 2);
  if (crc16(body) !== ((bytes[expected - 2]! << 8) | bytes[expected - 1]!)) throw new Error("Part de récupération invalide : vérifie les caractères saisis.");
  if (body[0] !== SHARE_VERSION) throw new Error("Version de part inconnue.");
  const k = body[1]!;
  const x = body[2]!;
  if (k < 2 || x < 1) throw new Error("Part de récupération invalide.");
  return { k, x, y: body.slice(3) };
}
