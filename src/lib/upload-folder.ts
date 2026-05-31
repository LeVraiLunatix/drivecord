/**
 * Folder-aware upload helpers.
 *
 * Turns dropped folders / <input webkitdirectory> selections into a flat list
 * of { file, path } entries (path = the relative DIRECTORY of the file, "" for
 * the drop root), then recreates the folder tree server-side and returns a map
 * of relative-path → folderId so each file can be uploaded into the right spot.
 */
import type { ParentId } from "@/lib/storage";

export type UploadEntry = {
  file: File;
  /** Relative directory path (no filename), e.g. "Photos/2024". "" = root. */
  path: string;
};

// ── Build entries ──────────────────────────────────────────────────────────────

/** From an <input webkitdirectory> / <input multiple> FileList. */
export function entriesFromFiles(files: File[]): UploadEntry[] {
  return files.map((f) => {
    const rel = (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name;
    const parts = rel.split("/");
    parts.pop(); // drop the filename
    return { file: f, path: parts.join("/") };
  });
}

type FsEntry = {
  isFile: boolean;
  isDirectory: boolean;
  name: string;
  file?: (cb: (f: File) => void, err: (e: unknown) => void) => void;
  createReader?: () => { readEntries: (cb: (e: FsEntry[]) => void, err: (e: unknown) => void) => void };
};

function fileFromEntry(entry: FsEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file!(resolve, reject));
}

function readAll(reader: ReturnType<NonNullable<FsEntry["createReader"]>>): Promise<FsEntry[]> {
  // readEntries returns at most ~100 entries per call; repeat until empty.
  return new Promise((resolve, reject) => {
    const all: FsEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) resolve(all);
        else { all.push(...batch); next(); }
      }, reject);
    next();
  });
}

async function traverse(entry: FsEntry, dir: string, out: UploadEntry[]): Promise<void> {
  if (entry.isFile) {
    try {
      const file = await fileFromEntry(entry);
      out.push({ file, path: dir });
    } catch { /* skip unreadable file */ }
  } else if (entry.isDirectory && entry.createReader) {
    const childDir = dir ? `${dir}/${entry.name}` : entry.name;
    const children = await readAll(entry.createReader());
    for (const c of children) await traverse(c, childDir, out);
  }
}

/** From a drop event's DataTransferItemList (supports nested folders). */
export async function entriesFromDataTransfer(dt: DataTransfer): Promise<UploadEntry[]> {
  const items = Array.from(dt.items);
  const roots = items
    .map((i) => (i.webkitGetAsEntry ? (i.webkitGetAsEntry() as FsEntry | null) : null))
    .filter((e): e is FsEntry => e != null);

  // No directory API support → fall back to the flat file list.
  if (roots.length === 0) {
    return entriesFromFiles(Array.from(dt.files));
  }

  const out: UploadEntry[] = [];
  for (const entry of roots) await traverse(entry, "", out);
  return out;
}

// ── Recreate folder tree ─────────────────────────────────────────────────────

/**
 * Create every folder needed by `paths` under `baseParentId`, parents first.
 * Returns a map of relative-path → folderId (with "" → baseParentId).
 */
export async function ensureFolderTree(
  paths: Set<string>,
  baseParentId: ParentId,
  createFolder: (args: { parentId: ParentId; name: string }) => Promise<string>,
): Promise<Map<string, ParentId>> {
  const map = new Map<string, ParentId>();
  map.set("", baseParentId);

  // Expand every intermediate path: "a/b/c" → a, a/b, a/b/c
  const all = new Set<string>();
  for (const p of paths) {
    if (!p) continue;
    const segs = p.split("/");
    let acc = "";
    for (const s of segs) { acc = acc ? `${acc}/${s}` : s; all.add(acc); }
  }

  // Shallowest first so parents exist before children.
  const sorted = [...all].sort((a, b) => a.split("/").length - b.split("/").length);
  for (const p of sorted) {
    const segs = p.split("/");
    const name = segs[segs.length - 1];
    const parentPath = segs.slice(0, -1).join("/");
    const parentId = map.get(parentPath) ?? baseParentId;
    const id = await createFolder({ parentId, name });
    map.set(p, id);
  }
  return map;
}
