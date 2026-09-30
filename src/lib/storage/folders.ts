"use client";

import { nanoid } from "nanoid";
import { mutate } from "swr";
import type { FolderEntry, FileEntry, ParentId } from "./schema";
import { ROOT_PARENT } from "./schema";
import { authFetch } from "@/lib/api-base";
import { decryptFile, decryptFolder } from "@/lib/e2ee-client/decrypt-items";
import { encryptFolderName } from "@/lib/crypto/e2ee";
import { tryGetDriveKeyMaterial } from "@/lib/e2ee-client/drive-keys";

function invalidateDrive(driveId: string) {
  mutate((key) => typeof key === "string" && key.includes(`/api/drive/${driveId}`));
}

async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await authFetch(url, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Erreur API");
  }
  return res;
}

export async function createFolder(args: {
  driveId: string;
  parentId: ParentId | null;
  name: string;
}): Promise<string> {
  const id = nanoid(12);
  // On an end-to-end encrypted drive the server gets only the encrypted name.
  const dk = await tryGetDriveKeyMaterial(args.driveId);
  await apiFetch(`/api/drive/${args.driveId}/folders`, {
    method: "POST",
    body: JSON.stringify({
      id,
      parentId: args.parentId ?? ROOT_PARENT,
      ...(dk ? { name: "", encName: await encryptFolderName(dk.key, id, args.name) } : { name: args.name }),
    }),
  });
  invalidateDrive(args.driveId);
  return id;
}

export async function renameFolder(driveId: string, id: string, name: string): Promise<void> {
  const dk = await tryGetDriveKeyMaterial(driveId);
  const current = dk ? await getFolderRaw(driveId, id) : undefined;
  await apiFetch(`/api/drive/${driveId}/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify(current?.encName && dk ? { encName: await encryptFolderName(dk.key, id, name) } : { name }),
  });
  invalidateDrive(driveId);
}

export async function setFolderColor(driveId: string, id: string, color: string | undefined): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ color: color ?? null }),
  });
  invalidateDrive(driveId);
}

export async function moveFolder(driveId: string, id: string, newParentId: ParentId | null): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ parentId: newParentId ?? ROOT_PARENT }),
  });
  invalidateDrive(driveId);
}

export async function trashFolder(driveId: string, id: string): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  });
  invalidateDrive(driveId);
}

export async function restoreFolder(driveId: string, id: string): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: false }),
  });
  invalidateDrive(driveId);
}

/**
 * List every file in a folder's subtree (with chunk refs), without deleting
 * anything. Used to attempt Discord cleanup BEFORE committing a permanent
 * delete, so a failed cleanup never orphans Discord attachments.
 */
export async function getFolderSubtreeFiles(driveId: string, id: string): Promise<FileEntry[]> {
  const res = await apiFetch(`/api/drive/${driveId}/folders/${id}?subtree=1`);
  const data = await res.json();
  const dk = await tryGetDriveKeyMaterial(driveId);
  return Promise.all((data.files as FileEntry[]).map((f) => decryptFile(dk, f)));
}

export async function hardDeleteFolderSubtree(
  driveId: string,
  id: string,
): Promise<{ deletedFileIds: string[]; deletedFolderIds: string[]; deletedFiles: FileEntry[] }> {
  const res = await apiFetch(`/api/drive/${driveId}/folders/${id}`, { method: "DELETE" });
  const data = await res.json();
  invalidateDrive(driveId);
  return {
    deletedFileIds: (data.deletedFiles as FileEntry[]).map((f) => f.id),
    deletedFolderIds: data.deletedFolderIds,
    deletedFiles: data.deletedFiles,
  };
}

export async function hardDeleteFolder(driveId: string, id: string): Promise<void> {
  await hardDeleteFolderSubtree(driveId, id);
}

async function getFolderRaw(driveId: string, id: string): Promise<FolderEntry | undefined> {
  const res = await authFetch(`/api/drive/${driveId}/folders/${id}`);
  if (!res.ok) return undefined;
  return res.json();
}

export async function getFolder(driveId: string, id: string): Promise<FolderEntry | undefined> {
  const raw = await getFolderRaw(driveId, id);
  return raw ? decryptFolder(await tryGetDriveKeyMaterial(driveId), raw) : undefined;
}

export async function listAllFolders(driveId: string): Promise<FolderEntry[]> {
  const res = await authFetch(`/api/drive/${driveId}/folders`);
  if (!res.ok) return [];
  const data = await res.json();
  const dk = await tryGetDriveKeyMaterial(driveId);
  return Promise.all((data.folders as FolderEntry[]).map((f) => decryptFolder(dk, f)));
}
