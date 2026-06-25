"use client";

import { decryptBlob } from "./vault-crypto";
import { getVaultKey } from "./vault-key-store";
import { getDriveKey } from "./drive-key-store";

/**
 * Decrypt a downloaded blob if the file is E2EE-encrypted; otherwise return it
 * as-is. Vault-locked files use the PIN-derived key; regular files use the
 * active drive's key. Throws (with a clear message) if the needed key is
 * missing — the caller should surface it.
 */
export async function maybeDecrypt(
  blob: Blob,
  file: { encIv?: string; locked?: boolean },
): Promise<Blob> {
  if (!file.encIv) return blob;
  const key = file.locked ? getVaultKey() : getDriveKey();
  if (!key) {
    throw new Error(
      file.locked
        ? "Coffre verrouillé — entre ton code PIN pour lire ce fichier."
        : "Clé du drive indisponible — reconnecte-toi pour lire ce fichier.",
    );
  }
  return decryptBlob(blob, key, file.encIv);
}
