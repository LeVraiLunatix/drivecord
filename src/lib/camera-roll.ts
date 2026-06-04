"use client";

import { isNativeApp } from "@/lib/use-platform";

export type CamItem = { identifier: string; album: string | null };

/** Camera-roll backup is app-only (needs native photo library access). */
export function cameraRollAvailable(): boolean {
  return isNativeApp();
}

/** Make an album name safe to use as a folder name. */
function sanitizeAlbum(name: string): string {
  return (name || "Album").replace(/[\\/]/g, "-").trim().slice(0, 60) || "Album";
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

const THUMB = { thumbnailWidth: 1, thumbnailHeight: 1, thumbnailQuality: 1 } as const;

/**
 * List every photo/video in the library, each tagged with the USER album it
 * belongs to (first match wins) so the backup can mirror albums as folders.
 * Media not in any user album → album: null (goes to the Pellicule root).
 */
export async function listCameraRoll(): Promise<CamItem[]> {
  if (!isNativeApp()) return [];
  const { Media } = await import("@capacitor-community/media");

  // identifier → user album name.
  const albumOf = new Map<string, string>();
  try {
    const { albums } = await Media.getAlbums();
    const userAlbums = (albums ?? []).filter((a) => a.type === "user" || a.type == null);
    for (const al of userAlbums) {
      try {
        const r = await Media.getMedias({ albumIdentifier: al.identifier, quantity: 100_000, ...THUMB });
        for (const m of r.medias ?? []) {
          if (!albumOf.has(m.identifier)) albumOf.set(m.identifier, sanitizeAlbum(al.name));
        }
      } catch { /* skip album */ }
    }
  } catch { /* getAlbums unsupported → no album mapping */ }

  const all = await Media.getMedias({ types: "all", quantity: 100_000, ...THUMB });
  return (all.medias ?? []).map((m) => ({
    identifier: m.identifier,
    album: albumOf.get(m.identifier) ?? null,
  }));
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic",
  gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4",
};

/**
 * Read a library asset's full-quality bytes by identifier.
 * Streams the file via a WebView-accessible URL (no giant base64 string in
 * memory — that was crashing on large videos). Falls back to base64 if needed.
 */
export async function readCameraItem(
  identifier: string,
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename: string; mimeType: string; path: string }> {
  const { Media } = await import("@capacitor-community/media");
  const { path } = await Media.getMediaByIdentifier({ identifier });
  const ext = (path.split(".").pop() ?? "jpg").toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const filename = path.split("/").pop() ?? `media-${identifier.slice(0, 8)}.${ext}`;

  let blob: Blob;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const src = Capacitor.convertFileSrc(path);
    const res = await fetch(src, { cache: "no-store", signal });
    if (!res.ok) throw new Error("fetch failed");
    blob = await res.blob();
  } catch {
    // Fallback: base64 read (heavier on memory, but reliable for smaller files).
    const { Filesystem } = await import("@capacitor/filesystem");
    const read = await Filesystem.readFile({ path });
    blob = base64ToBlob(read.data as string, mimeType);
  }
  return { blob, filename, mimeType: blob.type || mimeType, path };
}

/**
 * Delete the temp copy that `getMediaByIdentifier` writes into Library/Caches.
 * The plugin copies EVERY media (photo + video) to disk and never cleans up, so
 * without this the cache fills the device storage mid-backup → "Failed to save
 * video to disk" + crash around ~50 items. Call this after each media is done.
 */
export async function deleteCameraTemp(path: string): Promise<void> {
  if (!path) return;
  try {
    const { Filesystem } = await import("@capacitor/filesystem");
    await Filesystem.deleteFile({ path });
  } catch { /* best effort */ }
}

/** Remove leftover temp copies from previous (crashed) runs. Returns how many. */
export async function cleanupCameraTemps(): Promise<number> {
  let removed = 0;
  try {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { files } = await Filesystem.readdir({ directory: Directory.Cache, path: "" });
    for (const f of files) {
      const name = typeof f === "string" ? f : f.name;
      if (/^(image|video)-\d+\./.test(name)) {
        try { await Filesystem.deleteFile({ directory: Directory.Cache, path: name }); removed += 1; }
        catch { /* skip */ }
      }
    }
  } catch { /* best effort */ }
  return removed;
}

/**
 * Open a media asset as a **range-read** stream: each pull fetches the next
 * `chunkSize` slice via an HTTP Range request, so we never hold more than one
 * chunk in memory. This is the key fix for large videos — a plain `fetch()` on
 * Capacitor's file server returns the ENTIRE file in one shot (it buffers the
 * whole thing), which OOM-crashed the WebView mid-backup. Range requests make
 * Capacitor `seek` + read only the requested bytes (HTTP 206).
 */
export async function streamCameraItemRanged(
  identifier: string,
  chunkSize: number,
  signal?: AbortSignal,
): Promise<{ stream: ReadableStream<Uint8Array>; size: number; ranged: boolean; filename: string; mimeType: string; path: string }> {
  const { Media } = await import("@capacitor-community/media");
  const { Capacitor } = await import("@capacitor/core");
  const { path } = await Media.getMediaByIdentifier({ identifier });
  const ext = (path.split(".").pop() ?? "jpg").toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const filename = path.split("/").pop() ?? `media-${identifier.slice(0, 8)}.${ext}`;
  const src = Capacitor.convertFileSrc(path);

  let offset = 0;
  let total = -1;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (signal?.aborted) { controller.error(new DOMException("Aborted", "AbortError")); return; }
      if (total >= 0 && offset >= total) { controller.close(); return; }
      const end = offset + chunkSize - 1;
      const res = await fetch(src, { headers: { Range: `bytes=${offset}-${end}` }, cache: "no-store", signal });
      if (!res.ok && res.status !== 206) { controller.error(new Error(`range ${res.status}`)); return; }
      // Learn the real total from the first response's Content-Range.
      if (total < 0) {
        const cr = res.headers.get("Content-Range"); // "bytes 0-9999/123456"
        total = cr ? Number(cr.split("/")[1]) || 0 : Number(res.headers.get("Content-Length")) || 0;
      }
      const buf = new Uint8Array(await res.arrayBuffer());
      if (buf.length === 0) { controller.close(); return; }
      offset += buf.length;
      controller.enqueue(buf);
      if (total >= 0 && offset >= total) controller.close();
    },
  });

  // Probe size + whether Range is honored, WITHOUT downloading the file. If the
  // server ignores Range (status 200), reading the body would pull the whole
  // file into memory — so we cancel it and let the caller size-cap / skip.
  let ranged = false;
  try {
    const head = await fetch(src, { headers: { Range: "bytes=0-0" }, cache: "no-store", signal });
    if (head.status === 206) {
      ranged = true;
      const cr = head.headers.get("Content-Range"); // "bytes 0-0/123456"
      if (cr) total = Number(cr.split("/")[1]) || -1;
    } else {
      const cl = head.headers.get("Content-Length");
      if (cl) total = Number(cl) || -1;
    }
    await head.body?.cancel().catch(() => {});
  } catch { /* size/range unknown */ }

  return { stream, size: total > 0 ? total : 0, ranged, filename, mimeType, path };
}

// ── Backed-up tracker (per drive, localStorage) ──────────────────────────────
// Maps camera-roll identifier → the drive fileId it was uploaded as. Storing
// the fileId lets us reconcile: if the file was deleted from the drive, the
// media is considered NOT backed up and gets re-uploaded.

const KEY = (driveId: string) => `drivecord:camroll:${driveId}`;

/** identifier → fileId ("" for legacy entries with no recorded fileId). */
export function getBackedUpMap(driveId: string): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY(driveId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // Legacy format (array of identifiers) → migrate, fileId unknown.
      const map: Record<string, string> = {};
      for (const id of parsed as string[]) map[id] = "";
      return map;
    }
    return parsed as Record<string, string>;
  } catch {
    return {};
  }
}

function save(driveId: string, map: Record<string, string>): void {
  try { localStorage.setItem(KEY(driveId), JSON.stringify(map)); } catch { /* quota */ }
}

/** Set of identifiers currently considered backed up. */
export function getBackedUp(driveId: string): Set<string> {
  return new Set(Object.keys(getBackedUpMap(driveId)));
}

export function markBackedUp(driveId: string, identifier: string, fileId: string): void {
  if (typeof window === "undefined") return;
  const map = getBackedUpMap(driveId);
  map[identifier] = fileId;
  save(driveId, map);
}

/**
 * Drop tracker entries whose uploaded file no longer exists in the drive
 * (deleted/trashed). Entries with an unknown fileId ("") are kept. Returns the
 * reconciled set of still-backed-up identifiers.
 */
export function reconcileTracker(driveId: string, existingFileIds: Set<string>): Set<string> {
  const map = getBackedUpMap(driveId);
  let changed = false;
  for (const [identifier, fileId] of Object.entries(map)) {
    if (fileId && !existingFileIds.has(fileId)) { delete map[identifier]; changed = true; }
  }
  if (changed) save(driveId, map);
  return new Set(Object.keys(map));
}

/** Forget all backed-up tracking for a drive (forces a full re-upload). */
export function clearTracker(driveId: string): void {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(KEY(driveId)); } catch { /* ignore */ }
}
