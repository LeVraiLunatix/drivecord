"use client";

/**
 * Per-drive file encryption key.
 *
 * Each drive gets a random AES-256-GCM key, generated on the client and stored
 * (encrypted at rest) on the user's account so it syncs across devices. This key
 * encrypts every regular file uploaded to the drive — Discord only ever stores
 * ciphertext.
 *
 * The vault uses a separate, stronger key derived from the user's PIN
 * (see vault-crypto.ts). Both feed the generic encryptBlob/decryptBlob helpers.
 */

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

/** Generate a fresh random 256-bit key, returned as base64 (for storage + sync). */
export function generateDriveKeyB64(): string {
  return b64encode(crypto.getRandomValues(new Uint8Array(32)));
}

/** Import a base64 key into a non-extractable AES-GCM CryptoKey. */
export async function importDriveKey(keyB64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    b64decode(keyB64),
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}
