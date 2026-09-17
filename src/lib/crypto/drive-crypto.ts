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

const LOCAL_WRAP_KEY_STORAGE = "drv:lwk";
let localWrapKeyPromise: Promise<CryptoKey> | null = null;

/**
 * The drive file key is synced to the server (see module docblock) but is
 * also cached locally in IndexedDB for fast, offline-friendly access. Storing
 * that cache in plaintext means anyone who can read the browser's on-disk
 * profile (no script execution needed — a forensic dump, a storage-only
 * browser extension, a stolen device image) can lift every drive key at
 * once. We wrap it at rest with a random secret kept only in `sessionStorage`
 * — cleared when the browser session ends — so an offline dump of IndexedDB
 * alone is no longer enough; the wrapping secret must still be live.
 *
 * This does not protect against a live XSS payload running in an
 * authenticated tab (it could just call the API directly), only against
 * passive/offline access to persisted storage.
 */
async function getLocalWrapKey(): Promise<CryptoKey> {
  if (!localWrapKeyPromise) {
    localWrapKeyPromise = (async () => {
      let raw: Uint8Array;
      try {
        const existing = sessionStorage.getItem(LOCAL_WRAP_KEY_STORAGE);
        if (existing) {
          raw = new Uint8Array(b64decode(existing));
        } else {
          raw = crypto.getRandomValues(new Uint8Array(32));
          sessionStorage.setItem(LOCAL_WRAP_KEY_STORAGE, b64encode(raw));
        }
      } catch {
        // sessionStorage unavailable (private mode, native shell quirk, …):
        // fall back to a key that only lives for this JS heap's lifetime.
        raw = crypto.getRandomValues(new Uint8Array(32));
      }
      return crypto.subtle.importKey("raw", raw as BufferSource, { name: "AES-GCM" }, false, [
        "encrypt",
        "decrypt",
      ]);
    })();
  }
  return localWrapKeyPromise;
}

/** Wrap a raw base64 drive key for storage in local IndexedDB. */
export async function wrapDriveKeyForLocalStorage(rawKeyB64: string): Promise<string> {
  const kek = await getLocalWrapKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, kek, b64decode(rawKeyB64));
  return JSON.stringify({ w: b64encode(cipher), iv: b64encode(iv) });
}

/**
 * Reverse of {@link wrapDriveKeyForLocalStorage}. Falls back to returning
 * `stored` as-is when it isn't a wrapped blob — i.e. a value persisted
 * locally before this wrapping scheme existed (plain base64 key). The caller
 * should re-wrap and re-persist in that case to complete the migration.
 */
export async function unwrapDriveKeyFromLocalStorage(stored: string): Promise<string> {
  let parsed: { w?: string; iv?: string };
  try {
    parsed = JSON.parse(stored);
  } catch {
    return stored;
  }
  if (!parsed.w || !parsed.iv) return stored;
  const kek = await getLocalWrapKey();
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: b64decode(parsed.iv) },
    kek,
    b64decode(parsed.w),
  );
  return b64encode(plain);
}
