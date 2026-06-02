"use client";

import { isNativeApp } from "@/lib/use-platform";

export type CamItem = { identifier: string };

/** Camera-roll backup is app-only (needs native photo library access). */
export function cameraRollAvailable(): boolean {
  return isNativeApp();
}

function base64ToBlob(b64: string, type: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}

/**
 * List every photo/video identifier in the library (tiny thumbnails to keep
 * the payload small — we only need identifiers + order).
 */
export async function listCameraRoll(): Promise<CamItem[]> {
  if (!isNativeApp()) return [];
  const { Media } = await import("@capacitor-community/media");
  const res = await Media.getMedias({
    types: "all",
    quantity: 100_000,
    thumbnailWidth: 1,
    thumbnailHeight: 1,
    thumbnailQuality: 1,
  });
  return (res.medias ?? []).map((m) => ({ identifier: m.identifier }));
}

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", heic: "image/heic",
  gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", mov: "video/quicktime", m4v: "video/mp4",
};

/** Read a library asset's full-quality bytes by identifier. */
export async function readCameraItem(
  identifier: string,
): Promise<{ blob: Blob; filename: string; mimeType: string }> {
  const { Media } = await import("@capacitor-community/media");
  const { Filesystem } = await import("@capacitor/filesystem");
  const { path } = await Media.getMediaByIdentifier({ identifier });
  const read = await Filesystem.readFile({ path });
  const ext = (path.split(".").pop() ?? "jpg").toLowerCase();
  const mimeType = MIME_BY_EXT[ext] ?? "application/octet-stream";
  const filename = path.split("/").pop() ?? `media-${identifier.slice(0, 8)}.${ext}`;
  const blob = base64ToBlob(read.data as string, mimeType);
  return { blob, filename, mimeType };
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
