"use client";

import JSZip from "jszip";
import type { DiscordClient } from "@/lib/discord/client";
import type { DriveItem } from "@/lib/storage";
import { maybeDecrypt } from "@/lib/crypto/vault-decrypt";

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
      zip.file(prefix + item.filename, blob);
      onFile();
    } else {
      // Recurse into the folder.
      const children = await listFolderItems(driveId, item.id);
      await addItems(zip, children, driveId, client, `${prefix}${item.name}/`, onFile);
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
): Promise<void> {
  const zip = new JSZip();
  await addItems(zip, items, driveId, client, "", onFile);
  const blob = await zip.generateAsync({ type: "blob", compression: "STORE" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName.endsWith(".zip") ? zipName : `${zipName}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
