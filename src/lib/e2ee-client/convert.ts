"use client";

/**
 * Bulk operations on a drive's existing content:
 *  - convert a plaintext / legacy file to end-to-end format v1 ("Chiffrer maintenant")
 *  - encrypt the names of folders created before E2EE
 *  - rotate the drive key (re-wrap every file key, re-encrypt folder names)
 */
import { authFetch } from "@/lib/api-base";
import {
  b64decode,
  decryptFolderName,
  encryptFolderName,
  importAesKey,
  unwrapFileKey,
  wrapDriveKey,
  wrapFileKey,
  generateDriveKey,
} from "@/lib/crypto/e2ee";
import type { DiscordClient } from "@/lib/discord";
import { db } from "@/lib/storage/db";
import { hardDeleteFile, recordUploadedFile } from "@/lib/storage/files";
import type { FileEntry, FolderEntry } from "@/lib/storage/schema";
import { clearDriveKeyCache, getDriveKeyMaterialById } from "./drive-keys";
import { decryptDownloaded, isE2eeFile, prepareEncryptedUpload, readFileMeta } from "./file-crypto";
import { getMk } from "./keyring";

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await authFetch(path, { ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? "Erreur serveur.");
  return data as T;
}

/** Everything in the drive, trashed items included (vault files excluded: they're not ours to touch). */
export async function listWholeDrive(driveId: string) {
  return json<{ folders: FolderEntry[]; files: FileEntry[] }>(`/api/drive/${driveId}/tree?all=1`);
}

export const needsConversion = (f: FileEntry) => !f.locked && !isE2eeFile(f);

/**
 * Re-upload one file in format v1 and remove the old copy. Safe ordering: the new file is
 * fully recorded BEFORE the old one (row + Discord messages) is deleted.
 */
export async function convertFileToE2ee(client: DiscordClient, driveId: string, file: FileEntry): Promise<string> {
  const dk = await getDriveKeyMaterialById(driveId);
  const manifest = {
    size: file.size,
    mimeType: file.mimeType,
    filename: file.filename,
    chunkSize: file.chunkSize,
    chunks: file.chunks,
  };
  const raw = await client.downloadFile(manifest);
  const plain = await decryptDownloaded(driveId, raw, file);
  const source = new File([plain], file.filename, { type: file.mimeType || plain.type });

  const prep = await prepareEncryptedUpload(dk, source);
  const uploaded = await client.uploadStream(prep.stream, {
    filename: prep.discordName,
    mimeType: "application/octet-stream",
    totalSize: prep.cipherSize,
    chunkSize: prep.chunkSize,
  });
  let newId: string;
  try {
    newId = await recordUploadedFile({
      driveId,
      parentId: file.parentId,
      manifest: uploaded,
      tags: file.tags,
      e2ee: { fileId: prep.fileId, ...(await prep.finalize(uploaded.size)) },
      silent: true,
    });
  } catch (err) {
    await client.deleteFile(uploaded).catch(() => {});
    throw err;
  }
  if (file.favorite) {
    await json(`/api/drive/${driveId}/files/${newId}`, { method: "PATCH", body: JSON.stringify({ favorite: true }) }).catch(() => {});
  }
  // The old copy: Discord messages first, then the row.
  await client.deleteFile(manifest).catch(() => {});
  await hardDeleteFile(driveId, file.id);
  return newId;
}

/** Encrypt the names of folders created before E2EE (`name` plaintext, no `encName`). Idempotent. */
export async function encryptPlainFolderNames(driveId: string): Promise<number> {
  const dk = await getDriveKeyMaterialById(driveId);
  const { folders } = await listWholeDrive(driveId);
  let n = 0;
  for (const f of folders) {
    if (f.encName || !f.name) continue;
    await json(`/api/drive/${driveId}/folders/${f.id}`, {
      method: "PATCH",
      body: JSON.stringify({ encName: await encryptFolderName(dk.key, f.id, f.name) }),
    });
    n++;
  }
  return n;
}

export type RotationProgress = { phase: "convert" | "rewrap" | "commit"; done: number; total: number };

/**
 * Swap the drive key. The old key once existed on our server (before the migration), so this gives
 * the drive a key the server has provably never held. Legacy single-IV files are re-encrypted first
 * (they are keyed directly by the old DK); v1 files only need their file key re-wrapped.
 */
export async function rotateDriveKey(
  client: DiscordClient,
  driveId: string,
  onProgress?: (p: RotationProgress) => void,
): Promise<void> {
  const oldDk = await getDriveKeyMaterialById(driveId);
  let { folders, files } = await listWholeDrive(driveId);

  const legacy = files.filter(needsConversion).filter((f) => f.encIv);
  for (let i = 0; i < legacy.length; i++) {
    onProgress?.({ phase: "convert", done: i, total: legacy.length });
    await convertFileToE2ee(client, driveId, legacy[i]!);
  }
  if (legacy.length > 0) ({ folders, files } = await listWholeDrive(driveId));

  const newRaw = generateDriveKey();
  const newKey = await importAesKey(newRaw);
  const v1 = files.filter(isE2eeFile);
  const rewrapped: { id: string; fkWrapped: string }[] = [];
  for (let i = 0; i < v1.length; i++) {
    const f = v1[i]!;
    const fk = await unwrapFileKey(oldDk.raw, f.id, f.fkWrapped!);
    rewrapped.push({ id: f.id, fkWrapped: await wrapFileKey(newRaw, f.id, fk) });
    if (i % 50 === 0) onProgress?.({ phase: "rewrap", done: i, total: v1.length });
  }

  const encFolders: { id: string; encName: string }[] = [];
  for (const f of folders) {
    const name = f.encName ? await decryptFolderName(oldDk.key, f.id, f.encName) : f.name;
    if (!name) continue;
    encFolders.push({ id: f.id, encName: await encryptFolderName(newKey, f.id, name) });
  }

  onProgress?.({ phase: "commit", done: 0, total: 1 });
  const dkWrapped = await wrapDriveKey(getMk(), driveId, newRaw);
  await json(`/api/drive/${driveId}/e2ee/rotate`, {
    method: "POST",
    body: JSON.stringify({ dkWrapped, files: rewrapped, folders: encFolders }),
  });
  await db().drives.update(driveId, { dkWrapped });
  clearDriveKeyCache();
  onProgress?.({ phase: "commit", done: 1, total: 1 });
}

export { b64decode, readFileMeta };
