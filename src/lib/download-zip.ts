"use client";

import JSZip from "jszip";
import type { DiscordClient } from "@/lib/discord/client";
import type { DriveItem } from "@/lib/storage";
import { maybeDecrypt } from "@/lib/crypto/vault-decrypt";
import { saveBlob, type SaveDestination } from "@/lib/native-save";

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

/** Fetch the (non-trashed) items inside a folder. */
async function listFolderItems(driveId: string, parentId: string): Promise<DriveItem[]> {
  const res = await fetch(
    `/api/drive/${driveId}/items?parentId=${encodeURIComponent(parentId)}`,
  );
  if (!res.ok) return [];
  const data = await res.json();
  return (data.items ?? []) as DriveItem[];
}

async function addItems(
  zip: JSZip,
  items: DriveItem[],
  driveId: string,
  client: DiscordClient,
  prefix: string,
  onFile: () => void,
): Promise<void> {
  for (const item of items) {
    if (item.kind === "file") {
      const raw = await client.downloadFile({
        size: item.size,
        mimeType: item.mimeType,
        filename: item.filename,
        chunkSize: item.chunkSize,
        chunks: item.chunks,
      });
      const blob = await maybeDecrypt(raw, item);
      zip.file(prefix + sanitizeZipSegment(item.filename), blob);
      onFile();
    } else {
      // Recurse into the folder.
      const children = await listFolderItems(driveId, item.id);
      await addItems(zip, children, driveId, client, `${prefix}${sanitizeZipSegment(item.name)}/`, onFile);
    }
  }
}

/**
 * Download the given drive items (files and/or folders, recursively) as a
 * single ZIP. `onFile` is called after each file is added (for progress).
 */
export async function downloadItemsAsZip(
  items: DriveItem[],
  driveId: string,
  client: DiscordClient,
  zipName: string,
  onFile: () => void = () => {},
): Promise<SaveDestination> {
  const zip = new JSZip();
  await addItems(zip, items, driveId, client, "", onFile);
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  const name = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
  return saveBlob(blob, name, "application/zip");
}
