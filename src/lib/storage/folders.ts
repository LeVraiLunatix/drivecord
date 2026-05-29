"use client";

import { nanoid } from "nanoid";
import { mutate } from "swr";
import type { FolderEntry, FileEntry, ParentId } from "./schema";
import { ROOT_PARENT } from "./schema";

function invalidateDrive(driveId: string) {
  mutate((key) => typeof key === "string" && key.includes(`/api/drive/${driveId}`));
}

async function apiFetch(url: string, opts?: RequestInit): Promise<Response> {
  const res = await fetch(url, { ...opts, headers: { "Content-Type": "application/json", ...opts?.headers } });
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
  await apiFetch(`/api/drive/${args.driveId}/folders`, {
    method: "POST",
    body: JSON.stringify({ id, parentId: args.parentId ?? ROOT_PARENT, name: args.name }),
  });
  invalidateDrive(args.driveId);
  return id;
}

export async function renameFolder(driveId: string, id: string, name: string): Promise<void> {
  await apiFetch(`/api/drive/${driveId}/folders/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ name }),
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

export async function getFolder(driveId: string, id: string): Promise<FolderEntry | undefined> {
  const res = await fetch(`/api/drive/${driveId}/folders/${id}`);
  if (!res.ok) return undefined;
  return res.json();
}

export async function listAllFolders(driveId: string): Promise<FolderEntry[]> {
  const res = await fetch(`/api/drive/${driveId}/folders`);
  if (!res.ok) return [];
  const data = await res.json();
  return data.folders;
}
