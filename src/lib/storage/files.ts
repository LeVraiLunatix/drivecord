"use client";

import { nanoid } from "nanoid";
import { mutate } from "swr";
import type { FileManifest } from "@/lib/discord";
import type { FileEntry, ParentId } from "./schema";
import { ROOT_PARENT } from "./schema";

/** Invalidate all SWR caches for a drive. */
function invalidateDrive(driveId: string) {
  mutate((key) => typeof key === "string" && key.includes(`/api/drive/${driveId}`));
}

/** Public refresh — call once after a batch (e.g. camera-roll backup). */
export function refreshDrive(driveId: string) {
  invalidateDrive(driveId);
}

async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Erreur API");
  }
  return res;
}

/** Persist an uploaded file manifest into the server DB. Returns the new file id. */
export async function recordUploadedFile(args: {
  driveId: string;
  parentId: ParentId | null;
  manifest: FileManifest;
  tags?: string[];
  /** Set when the file was E2EE-encrypted before upload (vault). */
  locked?: boolean;
  encIv?: string;
  /** Skip SWR revalidation (batch uploads call refreshDrive once at the end). */
  silent?: boolean;
}): Promise<string> {
  const id = nanoid(12);
  await apiFetch(`/api/drive/${args.driveId}/files`, {
    method: "POST",
    body: JSON.stringify({
      id,
      parentId: args.parentId ?? ROOT_PARENT,
      filename: args.manifest.filename,
      size: args.manifest.size,
      mimeType: args.manifest.mimeType,
      chunkSize: args.manifest.chunkSize,
      chunks: args.manifest.chunks,
      tags: args.tags ?? [],
      locked: args.locked ?? false,
      encIv: args.encIv ?? null,
    }),
  });
  if (!args.silent) invalidateDrive(args.driveId);
  return id;
}

export async function getFile(driveId: string, id: string): Promise<FileEntry | undefined> {
  const res = await fetch(`/api/drive/${driveId}/files/${id}`);
  if (!res.ok) return undefined;
  return res.json();
}

export async function renameFile(driveId: string, id: string, filename: string): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ filename }),
  });
  invalidateDrive(driveId);
}

export async function moveFile(driveId: string, id: string, newParentId: ParentId | null): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ parentId: newParentId ?? ROOT_PARENT }),
  });
  invalidateDrive(driveId);
}

export async function setFavorite(driveId: string, id: string, favorite: boolean): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ favorite }),
  });
  invalidateDrive(driveId);
}

/** Move a file in/out of the locked vault. */
export async function setLocked(driveId: string, id: string, locked: boolean): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ locked }),
  });
  invalidateDrive(driveId);
}

export async function setTags(driveId: string, id: string, tags: string[]): Promise<void> {
  const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  await apiFetch(`/api/drive/${driveId}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ tags: cleaned }),
  });
  invalidateDrive(driveId);
}

export async function trashFile(driveId: string, id: string): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: true }),
  });
  invalidateDrive(driveId);
}

/**
 * Trash or restore many files/folders in a single request. Far faster than
 * looping per-item (one round-trip + one DB updateMany each, one cache refresh).
 * Returns how many rows changed.
 */
export async function bulkTrash(
  driveId: string,
  action: "trash" | "restore",
  fileIds: string[],
  folderIds: string[],
): Promise<{ files: number; folders: number }> {
  const res = await apiFetch(`/api/drive/${driveId}/bulk`, {
    method: "POST",
    body: JSON.stringify({ action, fileIds, folderIds }),
  });
  invalidateDrive(driveId);
  return res.json();
}

export async function restoreFile(driveId: string, id: string): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ trashed: false, trashedAt: null }),
  });
  invalidateDrive(driveId);
}

export async function hardDeleteFile(driveId: string, id: string): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/files/${id}`, { method: "DELETE" });
  invalidateDrive(driveId);
}

export async function updateFileChunks(driveId: string, id: string, chunks: FileEntry["chunks"]): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/files/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ chunks }),
  });
  invalidateDrive(driveId);
}
