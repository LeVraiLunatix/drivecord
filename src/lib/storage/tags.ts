import { db } from "./db";
import type { DriveItem } from "./schema";

function normTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-");
}

/** Replace the tag list of a file (overwrites). */
export async function setFileTags(
  fileId: string,
  tags: string[],
): Promise<void> {
  const deduped = [...new Set(tags.map(normTag).filter(Boolean))];
  await db().files.update(fileId, { tags: deduped, updatedAt: Date.now() });
}

/** Add one tag to a file (no-op if already present). */
export async function addFileTag(fileId: string, tag: string): Promise<void> {
  const t = normTag(tag);
  if (!t) return;
  const file = await db().files.get(fileId);
  if (!file) throw new Error("Fichier introuvable");
  if (file.tags.includes(t)) return;
  await db().files.update(fileId, {
    tags: [...file.tags, t],
    updatedAt: Date.now(),
  });
}

/** Remove one tag from a file. */
export async function removeFileTag(
  fileId: string,
  tag: string,
): Promise<void> {
  const file = await db().files.get(fileId);
  if (!file) throw new Error("Fichier introuvable");
  await db().files.update(fileId, {
    tags: file.tags.filter((t) => t !== tag),
    updatedAt: Date.now(),
  });
}

/** All unique tags used in a drive, with file counts, sorted alphabetically. */
export async function listAllTags(
  driveId: string,
): Promise<{ tag: string; count: number }[]> {
  const files = await db()
    .files.where("driveId")
    .equals(driveId)
    .filter((f) => !f.trashed && f.tags.length > 0)
    .toArray();
  const counts = new Map<string, number>();
  for (const file of files) {
    for (const tag of file.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => a.tag.localeCompare(b.tag, "fr"));
}

/** All non-trashed files in a drive that have a given tag. */
export async function getFilesByTag(
  driveId: string,
  tag: string,
): Promise<DriveItem[]> {
  // The *tags multi-entry index lets us find all rows where tags array contains `tag`.
  const files = await db()
    .files.where("tags")
    .equals(tag)
    .filter((f) => f.driveId === driveId && !f.trashed)
    .toArray();
  files.sort((a, b) =>
    a.filename.localeCompare(b.filename, "fr", { numeric: true }),
  );
  return files.map((f) => ({ kind: "file" as const, ...f }));
}
