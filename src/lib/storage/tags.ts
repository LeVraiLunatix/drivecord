"use client";

import { setTags, getFile } from "./files";
import type { DriveItem } from "./schema";

function normTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Replace the full tag list of a file. */
export async function setFileTags(driveId: string, fileId: string, tags: string[]): Promise<void> {
  const deduped = [...new Set(tags.map(normTag).filter(Boolean))];
  await setTags(driveId, fileId, deduped);
}

/** Add one tag (no-op if already present). */
export async function addFileTag(driveId: string, fileId: string, tag: string): Promise<void> {
  const t = normTag(tag);
  if (!t) return;
  const file = await getFile(driveId, fileId);
  if (!file) throw new Error("Fichier introuvable");
  if (file.tags.includes(t)) return;
  await setTags(driveId, fileId, [...file.tags, t]);
}

/** Remove one tag. */
export async function removeFileTag(driveId: string, fileId: string, tag: string): Promise<void> {
  const file = await getFile(driveId, fileId);
  if (!file) throw new Error("Fichier introuvable");
  await setTags(driveId, fileId, file.tags.filter((t) => t !== tag));
}

// Legacy export shape kept for compatibility (used by bulk-tag-dialog via DriveItem).
export type { DriveItem };
