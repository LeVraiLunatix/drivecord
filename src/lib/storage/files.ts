import { nanoid } from "nanoid";
import type { FileManifest } from "@/lib/discord";
import { db } from "./db";
import { ROOT_PARENT, type FileEntry, type ParentId } from "./schema";

function toPid(p: ParentId | null | undefined): ParentId {
  return p ?? ROOT_PARENT;
}

/**
 * Persist an uploaded file manifest into the file table.
 * Returns the new file id.
 */
export async function recordUploadedFile(args: {
  driveId: string;
  parentId: ParentId | null;
  manifest: FileManifest;
  tags?: string[];
}): Promise<string> {
  const id = nanoid(12);
  const now = Date.now();
  const row: FileEntry = {
    id,
    driveId: args.driveId,
    parentId: toPid(args.parentId),
    filename: args.manifest.filename,
    size: args.manifest.size,
    mimeType: args.manifest.mimeType,
    chunkSize: args.manifest.chunkSize,
    chunks: args.manifest.chunks,
    createdAt: now,
    updatedAt: now,
    tags: args.tags ?? [],
    favorite: false,
    trashed: false,
  };
  await db().files.add(row);
  return id;
}

export async function getFile(id: string): Promise<FileEntry | undefined> {
  return db().files.get(id);
}

export async function renameFile(id: string, filename: string): Promise<void> {
  await db().files.update(id, {
    filename: filename.trim(),
    updatedAt: Date.now(),
  });
}

export async function moveFile(
  id: string,
  newParentId: ParentId | null,
): Promise<void> {
  await db().files.update(id, {
    parentId: toPid(newParentId),
    updatedAt: Date.now(),
  });
}

export async function setFavorite(id: string, favorite: boolean): Promise<void> {
  await db().files.update(id, { favorite, updatedAt: Date.now() });
}

export async function setTags(id: string, tags: string[]): Promise<void> {
  const cleaned = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)));
  await db().files.update(id, { tags: cleaned, updatedAt: Date.now() });
}

export async function trashFile(id: string): Promise<void> {
  await db().files.update(id, { trashed: true, trashedAt: Date.now() });
}

export async function restoreFile(id: string): Promise<void> {
  await db().files.update(id, { trashed: false, trashedAt: undefined });
}

/** Hard-delete a file row. Does NOT touch the Discord chunks — caller decides
 *  whether to also call DiscordClient.deleteFile() to remove the actual data. */
export async function hardDeleteFile(id: string): Promise<void> {
  await db().files.delete(id);
}

/** Update only the chunks array — used after refreshing expired CDN URLs. */
export async function updateFileChunks(
  id: string,
  chunks: FileEntry["chunks"],
): Promise<void> {
  await db().files.update(id, { chunks, updatedAt: Date.now() });
}

export async function listChildFiles(
  driveId: string,
  parentId: ParentId | null,
  opts: { includeTrashed?: boolean } = {},
): Promise<FileEntry[]> {
  const rows = await db()
    .files.where("[driveId+parentId]")
    .equals([driveId, toPid(parentId)])
    .toArray();
  const out = opts.includeTrashed ? rows : rows.filter((r) => !r.trashed);
  out.sort((a, b) =>
    a.filename.localeCompare(b.filename, "fr", { numeric: true }),
  );
  return out;
}

/** All files (any folder) flagged trashed=true.
 *  Note: IndexedDB does not index `boolean` values, so we filter in-memory
 *  with a `.and()` predicate after narrowing by driveId. */
export async function listTrashedFiles(driveId: string): Promise<FileEntry[]> {
  return db()
    .files.where("driveId")
    .equals(driveId)
    .and((f) => f.trashed === true)
    .toArray();
}

export async function listFavorites(driveId: string): Promise<FileEntry[]> {
  return db()
    .files.where("driveId")
    .equals(driveId)
    .and((f) => f.favorite && !f.trashed)
    .toArray();
}

/** Naive substring search by filename. Case-insensitive. Limited to driveId. */
export async function searchFiles(
  driveId: string,
  query: string,
  opts: { includeTrashed?: boolean; limit?: number } = {},
): Promise<FileEntry[]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const limit = opts.limit ?? 200;
  const out: FileEntry[] = [];
  await db()
    .files.where("driveId")
    .equals(driveId)
    .until(() => out.length >= limit)
    .each((f) => {
      if (!opts.includeTrashed && f.trashed) return;
      if (f.filename.toLowerCase().includes(q)) out.push(f);
    });
  return out;
}

/**
 * Get every file row whose `parentId` matches one of the given folder ids,
 * without filtering by trashed. Used by recursive folder operations.
 */
export async function listFilesByParentIds(
  driveId: string,
  parentIds: ParentId[],
): Promise<FileEntry[]> {
  if (parentIds.length === 0) return [];
  const out: FileEntry[] = [];
  await db()
    .files.where("driveId")
    .equals(driveId)
    .each((f) => {
      if (parentIds.includes(f.parentId)) out.push(f);
    });
  return out;
}

/** Sum of file sizes in this drive (informational). */
export async function driveUsage(driveId: string): Promise<{
  fileCount: number;
  totalBytes: number;
}> {
  let fileCount = 0;
  let totalBytes = 0;
  await db()
    .files.where("driveId")
    .equals(driveId)
    .each((f) => {
      if (f.trashed) return;
      fileCount++;
      totalBytes += f.size;
    });
  return { fileCount, totalBytes };
}
