"use client";

/**
 * The decryption boundary: everything the drive UI reads from `/api/drive/*` passes through
 * here, so names/types/sizes of end-to-end encrypted items are opened once, in memory, and
 * the rest of the app keeps working with plain `filename` / `name` like before.
 */
import { decryptFolderName } from "@/lib/crypto/e2ee";
import type { DriveItem, FileEntry, FolderEntry } from "@/lib/storage/schema";
import { getDriveKeyMaterial, tryGetDriveKeyMaterial, type DriveKeyMaterial } from "./drive-keys";
import { isE2eeFile, readFileMeta } from "./file-crypto";

const UNREADABLE = "Élément chiffré (illisible)";

export async function decryptFile<T extends FileEntry>(dk: DriveKeyMaterial | null, f: T): Promise<T> {
  if (!isE2eeFile(f)) return f;
  if (!dk) return { ...f, filename: UNREADABLE, undecryptable: true };
  try {
    const meta = await readFileMeta(dk, f);
    return { ...f, filename: meta.name, mimeType: meta.mime, size: meta.size };
  } catch (err) {
    console.warn("[e2ee] impossible d'ouvrir les métadonnées du fichier", f.id, (err as Error).message);
    return { ...f, filename: UNREADABLE, undecryptable: true };
  }
}

export async function decryptFolder<T extends FolderEntry>(dk: DriveKeyMaterial | null, f: T): Promise<T> {
  if (!f.encName) return f;
  if (!dk) return { ...f, name: UNREADABLE };
  try {
    return { ...f, name: await decryptFolderName(dk.key, f.id, f.encName) };
  } catch {
    return { ...f, name: UNREADABLE };
  }
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });
const nameOf = (i: DriveItem) => (i.kind === "folder" ? i.name : i.filename);

/** Folders first, then files, each by name — the server can't sort names it can't read. */
export function sortItems<T extends DriveItem>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === "folder" ? -1 : 1;
    return collator.compare(nameOf(a), nameOf(b));
  });
}

export async function decryptItems(driveId: string, items: DriveItem[], opts: { sort?: boolean } = {}): Promise<DriveItem[]> {
  if (!items.some((i) => (i.kind === "file" ? isE2eeFile(i) : Boolean(i.encName)))) return items;
  const dk = await tryGetDriveKeyMaterial(driveId);
  if (!dk) console.warn("[e2ee] clé du drive indisponible pour", driveId);
  const out = await Promise.all(items.map((i) => (i.kind === "folder" ? decryptFolder(dk, i) : decryptFile(dk, i))));
  return opts.sort ? sortItems(out) : out;
}

/**
 * Decrypt whatever a `/api/drive/:id/…` endpoint returned. Known shapes:
 *   { items } · { folders } · { files } · { path } · a bare file or folder entry.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function decryptPayload(driveId: string, url: string, data: any): Promise<any> {
  if (!data || typeof data !== "object") return data;
  const listing = /[?&](parentId|tag)=|view=favorites/.test(url);
  const dk = await tryGetDriveKeyMaterial(driveId);
  if (Array.isArray(data.items)) return { ...data, items: await decryptItems(driveId, data.items, { sort: listing }) };
  if (Array.isArray(data.folders)) return { ...data, folders: await Promise.all(data.folders.map((f: FolderEntry) => decryptFolder(dk, f))) };
  if (Array.isArray(data.files)) return { ...data, files: await Promise.all(data.files.map((f: FileEntry) => decryptFile(dk, f))) };
  if (Array.isArray(data.path)) return { ...data, path: await Promise.all(data.path.map((f: FolderEntry) => decryptFolder(dk, f))) };
  if ("encName" in data && data.encName) return decryptFolder(dk, data);
  if ("cryptoVersion" in data && data.cryptoVersion) return decryptFile(dk, data);
  return data;
}

export { getDriveKeyMaterial };
