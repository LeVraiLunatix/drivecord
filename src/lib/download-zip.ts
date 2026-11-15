"use client";

import JSZip from "jszip";
import type { DiscordClient } from "@/lib/discord/client";
import type { DriveItem } from "@/lib/storage";
import { maybeDecrypt } from "@/lib/crypto/vault-decrypt";
import { saveBlob, type SaveDestination } from "@/lib/native-save";
import { toast } from "sonner";
import { formatBytes } from "@/lib/utils/format";

type FileItem = Extract<DriveItem, { kind: "file" }>;

/**
 * A ZIP is built in memory (browser APIs have no streaming ZIP writer), so a huge selection would
 * crash the tab — on iPhone, reload the page — with nothing saved. Past this, say so up front.
 */
export const ZIP_MAX_BYTES = 1024 * 1024 * 1024;

/**
 * Neutralize path-traversal/separator characters in a single path segment
 * before it becomes part of a ZIP entry name. Names come from this drive's
 * own file/folder metadata, but a future bug (or a synced/imported name)
 * could smuggle `../` into one — a naive unzip tool would then write outside
 * the extraction directory ("zip slip"). Stripping separators and leading
 * dots here means the ZIP can never contain a traversal path, regardless of
 * what validation exists upstream.
 */
function sanitizeZipSegment(name: string): string {
  const cleaned = name.replace(/[/\\]/g, "_").replace(/^\.+/, "_");
  return cleaned || "_";
}

/** Fetch the (non-trashed) items inside a folder. A failure must stop the ZIP, never yield an "empty" folder. */
async function listFolderItems(driveId: string, parentId: string): Promise<DriveItem[]> {
  const res = await fetch(`/api/drive/${driveId}/items?parentId=${encodeURIComponent(parentId)}`);
  if (!res.ok) throw new Error(`Impossible de lister un dossier (erreur ${res.status}).`);
  const data = await res.json();
  return (data.items ?? []) as DriveItem[];
}

type Entry = { path: string; item: FileItem };

/** `a.txt`, `a (2).txt`… — two files may share a name (nothing forbids it), and the ZIP must keep both. */
function uniquePath(path: string, taken: Set<string>): string {
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  const base = dot > slash + 1 ? path.slice(0, dot) : path;
  const ext = dot > slash + 1 ? path.slice(dot) : "";
  let candidate = path;
  for (let i = 2; taken.has(candidate.toLowerCase()); i++) candidate = `${base} (${i})${ext}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/** Walk the selection: every file with its ZIP path, plus every folder (so empty ones survive). */
async function collect(
  items: DriveItem[],
  driveId: string,
  prefix: string,
  taken: Set<string>,
  out: { files: Entry[]; folders: string[] },
): Promise<void> {
  for (const item of items) {
    if (item.kind === "file") {
      out.files.push({ path: uniquePath(prefix + sanitizeZipSegment(item.filename), taken), item });
    } else {
      const dir = uniquePath(`${prefix}${sanitizeZipSegment(item.name)}`, taken);
      out.folders.push(dir);
      await collect(await listFolderItems(driveId, item.id), driveId, `${dir}/`, taken, out);
    }
  }
}

export type ZipResult = { dest: SaveDestination; added: number; skipped: string[] };

/**
 * Download the given drive items (files and/or folders, recursively) as a single ZIP.
 * A file that fails (locked vault, missing key…) is skipped and reported, not fatal.
 * `onProgress(done, total)` is called after each file.
 */
export async function downloadItemsAsZip(
  items: DriveItem[],
  driveId: string,
  client: DiscordClient,
  zipName: string,
  onProgress: (done: number, total: number) => void = () => {},
  signal?: AbortSignal,
): Promise<ZipResult> {
  const found: { files: Entry[]; folders: string[] } = { files: [], folders: [] };
  await collect(items, driveId, "", new Set(), found);

  const total = found.files.reduce((n, f) => n + f.item.size, 0);
  if (total > ZIP_MAX_BYTES) {
    throw new Error(
      `Sélection trop volumineuse pour un ZIP (${formatBytes(total)}, max ${formatBytes(ZIP_MAX_BYTES)}). ` +
        "Télécharge les gros fichiers un par un, ou découpe la sélection.",
    );
  }

  const zip = new JSZip();
  for (const dir of found.folders) zip.folder(dir);
  const skipped: string[] = [];
  let done = 0;
  onProgress(0, found.files.length);
  for (const { path, item } of found.files) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      const raw = await client.downloadFile(
        { size: item.size, mimeType: item.mimeType, filename: item.filename, chunkSize: item.chunkSize, chunks: item.chunks },
        { signal },
      );
      zip.file(path, await maybeDecrypt(raw, item));
    } catch (e) {
      if ((e as Error).name === "AbortError") throw e;
      skipped.push(`${item.filename} (${(e as Error).message})`);
    }
    onProgress(++done, found.files.length);
  }
  if (skipped.length === found.files.length && found.files.length > 0) {
    throw new Error(`Aucun fichier n'a pu être téléchargé : ${skipped[0]}`);
  }

  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  const name = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
  return { dest: await saveBlob(blob, name, "application/zip"), added: found.files.length - skipped.length, skipped };
}

/** `downloadItemsAsZip` with a progress toast (n/total, Cancel) and an honest summary. */
export async function downloadZipWithToast(items: DriveItem[], driveId: string, client: DiscordClient, zipName: string): Promise<void> {
  const ac = new AbortController();
  const show = (msg: string, id?: string | number) =>
    toast.loading(msg, { id, action: { label: "Annuler", onClick: () => ac.abort() } });
  const id = show("Préparation du ZIP…");
  try {
    const { dest, added, skipped } = await downloadItemsAsZip(
      items, driveId, client, zipName,
      (done, total) => void show(`ZIP : ${done}/${total} fichier${total > 1 ? "s" : ""}…`, id),
      ac.signal,
    );
    const where = dest === "files" ? "enregistré dans Fichiers › Drivecord" : dest === "gallery" ? "enregistré" : "téléchargé";
    if (skipped.length) {
      toast.warning(`ZIP ${where} (${added} fichier${added > 1 ? "s" : ""}), mais ${skipped.length} ignoré${skipped.length > 1 ? "s" : ""} : ${skipped.slice(0, 3).join(" ; ")}${skipped.length > 3 ? "…" : ""}`, { id, duration: 15_000 });
    } else {
      toast.success(`ZIP ${where} (${added} fichier${added > 1 ? "s" : ""})`, { id });
    }
  } catch (e) {
    if ((e as Error).name === "AbortError") toast.dismiss(id);
    else toast.error(`ZIP impossible : ${(e as Error).message}`, { id });
  }
}
