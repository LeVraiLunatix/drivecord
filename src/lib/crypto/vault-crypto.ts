"use client";

/**
 * Vault end-to-end encryption (AES-256-GCM).
 *
 * The vault key is derived from the user's PIN with PBKDF2 + a per-user salt
 * (stored server-side, NOT secret on its own). Each file gets a random IV.
 * The key never leaves the device; the server only stores ciphertext + IV.
 */

const PBKDF2_ITERATIONS = 200_000;

function b64encode(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function b64decode(str: string): ArrayBuffer {
  const bin = atob(str);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Generate a fresh random salt (base64) — created once per user when the PIN is set. */
export function randomSaltB64(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(16)));
}

/** Derive the AES-GCM vault key from the PIN + base64 salt. */
export async function deriveVaultKey(pin: string, saltB64: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: b64decode(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/**
 * Derive the raw 256-bit key material from PIN+salt directly (not wrapped in
 * a non-extractable CryptoKey). Used only to migrate legacy vaults whose
 * files were encrypted directly with `deriveVaultKey(pin, salt)`, before the
 * wrapped-master-key scheme existed — it produces the exact same key bytes
 * so already-encrypted files keep decrypting once wrapped for storage.
 */
export async function deriveVaultKeyRaw(pin: string, saltB64: string): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const baseKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: b64decode(saltB64), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    baseKey,
    256,
  );
  return new Uint8Array(bits);
}

/**
 * Generate a fresh random 256-bit vault master key. This is the key that
 * actually encrypts file content; it never changes for the lifetime of the
 * vault. It is only ever wrapped (encrypted) under a PIN-derived KEK before
 * being sent to the server, so a PIN change only needs to re-wrap this small
 * blob instead of re-encrypting every file.
 */
export function generateMasterKeyBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

/** Import raw master-key bytes as a non-extractable AES-GCM CryptoKey. */
export async function importMasterKey(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

/** Wrap (encrypt) the raw master key bytes under a PIN-derived KEK. */
export async function wrapMasterKey(
  raw: Uint8Array,
  kek: CryptoKey,
): Promise<{ wrapped: string; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, raw as BufferSource);
  return { wrapped: b64encode(cipher), iv: b64encode(iv) };
}

/** Unwrap a previously wrapped master key back into a usable CryptoKey. */
export async function unwrapMasterKey(
  wrappedB64: string,
  ivB64: string,
  kek: CryptoKey,
): Promise<CryptoKey> {
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) },
    kek,
    b64decode(wrappedB64),
  );
  return importMasterKey(new Uint8Array(plain));
}

/** Encrypt a blob. Returns the ciphertext blob and the base64 IV to store. */
export async function encryptBlob(blob: Blob, key: CryptoKey): Promise<{ blob: Blob; iv: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = await blob.arrayBuffer();
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plain);
  return { blob: new Blob([cipher]), iv: b64encode(iv) };
}

/** Decrypt a blob previously encrypted with {@link encryptBlob}. */
export async function decryptBlob(blob: Blob, key: CryptoKey, ivB64: string): Promise<Blob> {
  const cipher = await blob.arrayBuffer();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(ivB64) },
    key,
    cipher,
  );
  return new Blob([plain]);
}
