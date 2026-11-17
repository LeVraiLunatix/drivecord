"use client";

import { toast } from "sonner";
import type { DiscordClient } from "@/lib/discord/client";
import type { FileEntry } from "@/lib/storage/schema";
import type { DownloadProgress } from "@/lib/discord/types";
import { createDecryptTransform } from "@/lib/crypto/e2ee";
import { maybeDecrypt } from "@/lib/crypto/vault-decrypt";
import { getDriveKeyMaterialById } from "@/lib/e2ee-client/drive-keys";
import { getFileCipher, isE2eeFile } from "@/lib/e2ee-client/file-crypto";
import { openSaveSink, toastSaved, type SaveDestination } from "@/lib/native-save";
import { formatBytes } from "@/lib/utils/format";

export type FileItem = FileEntry;

type Opts = { signal?: AbortSignal; onProgress?: (p: DownloadProgress) => void };

/**
 * Fetch → (decrypt) → save one file with flat memory use: chunks go to disk as they arrive
 * (app: Files/Photos; browsers with the File System Access API: the chosen file). Only the formats
 * that cannot be decrypted piece by piece (legacy single-IV, vault) are still held in memory.
 * Call it straight from the click handler: the save dialog needs the user gesture.
 */
export async function downloadFileToDevice(client: DiscordClient, item: FileItem, opts: Opts = {}): Promise<SaveDestination> {
  const manifest = { size: item.size, mimeType: item.mimeType, filename: item.filename, chunkSize: item.chunkSize, chunks: item.chunks };
  const streamable = !item.locked && !item.encIv;
  const sink = await openSaveSink(item.filename, item.mimeType, { size: item.size, preferDisk: streamable });
  try {
    if (streamable && isE2eeFile(item)) {
      const cipher = await getFileCipher(await getDriveKeyMaterialById(item.driveId), item);
      const t = createDecryptTransform(cipher);
      const writer = t.writable.getWriter();
      const pump = t.readable.pipeTo(
        new WritableStream<Uint8Array>({ write: (c) => sink.write(new Blob([c as BlobPart])) }),
      );
      try {
        await client.downloadFileTo(manifest, async (part) => writer.write(new Uint8Array(await part.arrayBuffer())), opts);
        await writer.close();
      } catch (e) {
        await writer.abort(e).catch(() => {});
        await pump.catch(() => {});
        throw e;
      }
      await pump;
    } else if (streamable) {
      await client.downloadFileTo(manifest, (part) => sink.write(part), opts);
    } else {
      const raw = await client.downloadFile(manifest, opts);
      await sink.write(await maybeDecrypt(raw, item));
    }
    return await sink.finish();
  } catch (e) {
    await sink.abort();
    throw e;
  }
}

const inFlight = new Set<string>();

/** `downloadFileToDevice` with a progress toast (percent, Cancel) — the one button handler everything shares. */
export async function downloadFileWithToast(client: DiscordClient, item: FileItem): Promise<void> {
  if (inFlight.has(item.id)) { toast.info(`« ${item.filename} » est déjà en cours de téléchargement.`); return; }
  inFlight.add(item.id);
  const ac = new AbortController();
  let id: string | number | undefined;
  const label = (pct?: number) => `Téléchargement de « ${item.filename} »${pct === undefined ? "…" : `, ${pct} %`} (${formatBytes(item.size)})`;
  const show = (pct?: number) => {
    id = toast.loading(label(pct), { id, action: { label: "Annuler", onClick: () => ac.abort() } });
  };
  let lastPct = -1;
  try {
    // Opens the save dialog first (needs the click), then shows progress.
    const dest = await downloadFileToDevice(client, item, {
      signal: ac.signal,
      onProgress: (p) => {
        if (id === undefined) show();
        const pct = p.total > 0 ? Math.min(100, Math.floor((p.loaded / p.total) * 100)) : undefined;
        if (pct !== undefined && pct !== lastPct) { lastPct = pct; show(pct); }
      },
    });
    toastSaved(item.filename, dest, id);
  } catch (err) {
    const e = err as Error;
    if (e.name === "AbortError") toast.dismiss(id); // cancelled by the user (or the save dialog)
    else toast.error(`Échec : ${e.message}`, { id });
  } finally {
    inFlight.delete(item.id);
  }
}
