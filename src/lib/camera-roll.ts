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
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const { Media } = await import("@capacitor-community/media");
  const { path } = await Media.getMediaByIdentifier({ identifier });
  const ext = (path.split(".").pop() ?? "jpg").toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const filename = path.split("/").pop() ?? `media-${identifier.slice(0, 8)}.${ext}`;

  let blob: Blob;
  try {
    const { Capacitor } = await import("@capacitor/core");
    const src = Capacitor.convertFileSrc(path);
    const res = await fetch(src);
    if (!res.ok) throw new Error("fetch failed");
    blob = await res.blob();
  } catch {
    // Fallback: base64 read (heavier on memory, but reliable for smaller files).
    const { Filesystem } = await import("@capacitor/filesystem");
    const read = await Filesystem.readFile({ path });
    blob = base64ToBlob(read.data as string, mimeType);
  }
  return { blob, filename, mimeType: blob.type || mimeType };
}

// ── Backed-up tracker (per drive, localStorage) ──────────────────────────────

const KEY = (driveId: string) => `drivecord:camroll:${driveId}`;

export function getBackedUp(driveId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY(driveId));
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export function markBackedUp(driveId: string, identifiers: string[]): void {
  if (typeof window === "undefined") return;
  const set = getBackedUp(driveId);
  for (const id of identifiers) set.add(id);
  try {
    localStorage.setItem(KEY(driveId), JSON.stringify([...set]));
  } catch {
    /* quota — ignore */
  }
}
