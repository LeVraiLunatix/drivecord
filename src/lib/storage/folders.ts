import { nanoid } from "nanoid";
import { db } from "./db";
import { ROOT_PARENT, type FolderEntry, type ParentId } from "./schema";

/**
 * Walk the folder tree starting at `rootFolderId` (inclusive) and return
 * every descendant folder id. BFS so we naturally process top-down.
 * The root id is returned in position 0.
 */
async function collectDescendantFolderIds(
  driveId: string,
  rootFolderId: string,
): Promise<string[]> {
  const all: string[] = [rootFolderId];
  const queue: string[] = [rootFolderId];
  while (queue.length > 0) {
    const parent = queue.shift()!;
    const children = await db()
      .folders.where("[driveId+parentId]")
      .equals([driveId, parent])
      .toArray();
    for (const c of children) {
      all.push(c.id);
      queue.push(c.id);
    }
  }
  return all;
}

/** Normalize a nullable parent into our sentinel-string form. */
function toPid(p: ParentId | null | undefined): ParentId {
  return p ?? ROOT_PARENT;
}

/** Create a folder. Returns the new id. */
export async function createFolder(args: {
  driveId: string;
  parentId: ParentId | null;
  name: string;
}): Promise<string> {
  const id = nanoid(12);
  const now = Date.now();
  const row: FolderEntry = {
    id,
    driveId: args.driveId,
    parentId: toPid(args.parentId),
    name: args.name.trim() || "Nouveau dossier",
    createdAt: now,
    updatedAt: now,
    trashed: false,
  };
  await db().folders.add(row);
  return id;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await db().folders.update(id, { name: name.trim(), updatedAt: Date.now() });
}

/** Set (or clear) a folder's display color. Pass `undefined` to reset to default. */
export async function setFolderColor(
  id: string,
  color: string | undefined,
): Promise<void> {
  await db().folders.update(id, { color, updatedAt: Date.now() });
}

/**
 * Move a folder under a new parent.
 * Refuses to create a cycle (moving a folder inside one of its descendants).
 */
export async function moveFolder(
  id: string,
  newParentId: ParentId | null,
): Promise<void> {
  const target = toPid(newParentId);
  if (id === target) throw new Error("Un dossier ne peut être son propre parent");
  if (target !== ROOT_PARENT) {
    // Walk up from target to root and refuse if we hit `id`.
    const visited = new Set<string>();
    let cur: ParentId = target;
    while (cur && cur !== ROOT_PARENT) {
      if (cur === id) throw new Error("Déplacement créerait un cycle");
      if (visited.has(cur)) break;
      visited.add(cur);
      const parent: FolderEntry | undefined = await db().folders.get(cur);
      cur = parent?.parentId ?? ROOT_PARENT;
    }
  }
  await db().folders.update(id, {
    parentId: target,
    updatedAt: Date.now(),
  });
}

/**
 * Soft-delete a folder AND every descendant folder + every file inside the
 * subtree. The user can restore from the trash later via `restoreFolder`.
 */
export async function trashFolder(id: string): Promise<void> {
  const folder = await db().folders.get(id);
  if (!folder) return;
  const now = Date.now();
  const ids = await collectDescendantFolderIds(folder.driveId, id);
  await db().transaction("rw", [db().folders, db().files], async () => {
    for (const fid of ids) {
      await db()
        .folders.update(fid, { trashed: true, trashedAt: now });
      await db()
        .files.where("[driveId+parentId]")
        .equals([folder.driveId, fid])
        .modify({ trashed: true, trashedAt: now });
    }
  });
}

/** Symmetric to `trashFolder`: restore the whole subtree. */
export async function restoreFolder(id: string): Promise<void> {
  const folder = await db().folders.get(id);
  if (!folder) return;
  const ids = await collectDescendantFolderIds(folder.driveId, id);
  await db().transaction("rw", [db().folders, db().files], async () => {
    for (const fid of ids) {
      await db()
        .folders.update(fid, { trashed: false, trashedAt: undefined });
      await db()
        .files.where("[driveId+parentId]")
        .equals([folder.driveId, fid])
        .modify({ trashed: false, trashedAt: undefined });
    }
  });
}

/**
 * Hard-delete a folder and the metadata of every file/folder in its subtree.
 *
 * IMPORTANT: this only wipes the IndexedDB metadata. To also delete the
 * Discord messages, iterate the file list yourself before calling this —
 * the storage layer has no access to the Discord client.
 *
 * Returns the list of file rows that were deleted, so the caller can
 * orchestrate the Discord deletion.
 */
export async function hardDeleteFolderSubtree(
  id: string,
): Promise<{ deletedFileIds: string[]; deletedFolderIds: string[] }> {
  const folder = await db().folders.get(id);
  if (!folder) return { deletedFileIds: [], deletedFolderIds: [] };
  const folderIds = await collectDescendantFolderIds(folder.driveId, id);
  const fileIds: string[] = [];
  await db().transaction("rw", [db().folders, db().files], async () => {
    for (const fid of folderIds) {
      const files = await db()
        .files.where("[driveId+parentId]")
        .equals([folder.driveId, fid])
        .primaryKeys();
      fileIds.push(...(files as string[]));
    }
    if (fileIds.length > 0) await db().files.bulkDelete(fileIds);
    await db().folders.bulkDelete(folderIds);
  });
  return { deletedFileIds: fileIds, deletedFolderIds: folderIds };
}

/** Hard-delete just one folder row. Use only on empty folders. */
export async function hardDeleteFolder(id: string): Promise<void> {
  await db().folders.delete(id);
}

export async function listChildFolders(
  driveId: string,
  parentId: ParentId | null,
  opts: { includeTrashed?: boolean } = {},
): Promise<FolderEntry[]> {
  const rows = await db()
    .folders.where("[driveId+parentId]")
    .equals([driveId, toPid(parentId)])
    .toArray();
  const out = opts.includeTrashed ? rows : rows.filter((r) => !r.trashed);
  out.sort((a, b) => a.name.localeCompare(b.name, "fr", { numeric: true }));
  return out;
}

export async function getFolder(id: string): Promise<FolderEntry | undefined> {
  return db().folders.get(id);
}

/**
 * Count direct children of `folderId` (1 level). Counts folders + files,
 * excluding trashed items. Used for the badge on folder cards.
 */
export async function countFolderChildren(
  driveId: string,
  folderId: ParentId,
): Promise<number> {
  const [f, fi] = await Promise.all([
    db()
      .folders.where("[driveId+parentId]")
      .equals([driveId, folderId])
      .filter((r) => !r.trashed)
      .count(),
    db()
      .files.where("[driveId+parentId]")
      .equals([driveId, folderId])
      .filter((r) => !r.trashed)
      .count(),
  ]);
  return f + fi;
}

/**
 * Snapshot the entire folder tree of a drive as a parent→children map.
 * Used by the MoveDialog folder picker.
 */
export async function listAllFolders(driveId: string): Promise<FolderEntry[]> {
  const rows = await db().folders.where("driveId").equals(driveId).toArray();
  return rows.filter((r) => !r.trashed);
}

/**
 * Resolve the breadcrumb path from the root down to (and including) `folderId`.
 * Returns [] for the drive root.
 */
export async function resolveFolderPath(
  folderId: ParentId | null,
): Promise<FolderEntry[]> {
  const start = toPid(folderId);
  if (start === ROOT_PARENT) return [];
  const path: FolderEntry[] = [];
  let cur: ParentId = start;
  const guard = new Set<string>();
  while (cur && cur !== ROOT_PARENT && !guard.has(cur)) {
    guard.add(cur);
    const row: FolderEntry | undefined = await db().folders.get(cur);
    if (!row) break;
    path.unshift(row);
    cur = row.parentId;
  }
  return path;
}
