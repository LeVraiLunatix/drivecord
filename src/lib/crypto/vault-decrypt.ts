"use client";

import { decryptBlob } from "./vault-crypto";
import { getVaultKey } from "./vault-key-store";
import { decryptDownloaded, isE2eeFile } from "@/lib/e2ee-client/file-crypto";
import type { FileEntry } from "@/lib/storage/schema";

/**
 * Decrypt a downloaded blob if the file is E2EE-encrypted; otherwise return it
 * as-is.
 *  - vault-locked files use the PIN-derived vault key;
 *  - end-to-end encrypted files (format v1) and legacy single-IV files use the
 *    drive key, unwrapped from the user's Master Key.
 * Throws (with a clear message) if the needed key is missing — the caller should surface it.
 */
export async function maybeDecrypt(
  blob: Blob,
  file: Pick<FileEntry, "id" | "driveId" | "encIv" | "locked" | "cryptoVersion" | "fkWrapped" | "noncePrefix" | "encMeta"> &
    Partial<FileEntry>,
): Promise<Blob> {
  if (file.locked) {
    if (!file.encIv) return blob;
    const key = getVaultKey();
    if (!key) throw new Error("Coffre verrouillé — entre ton code PIN pour lire ce fichier.");
    return decryptBlob(blob, key, file.encIv);
  }
  if (!isE2eeFile(file) && !file.encIv) return blob;
  try {
    return await decryptDownloaded(file.driveId, blob, file as FileEntry);
  } catch (err) {
    throw new Error(
      (err as Error).message.includes("verrouillé")
        ? (err as Error).message
        : "Impossible de déchiffrer ce fichier (clé indisponible ou fichier altéré).",
    );
  }
}
