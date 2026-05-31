"use client";

import { decryptBlob } from "./vault-crypto";
import { getVaultKey } from "./vault-key-store";

/**
 * Decrypt a downloaded blob if the file is E2EE-encrypted; otherwise return it
 * as-is. Throws if the vault is locked (no key) — caller should surface it.
 */
export async function maybeDecrypt(blob: Blob, file: { encIv?: string }): Promise<Blob> {
  if (!file.encIv) return blob;
  const key = getVaultKey();
  if (!key) {
    throw new Error("Coffre verrouillé — entre ton code PIN pour lire ce fichier.");
  }
  return decryptBlob(blob, key, file.encIv);
}
