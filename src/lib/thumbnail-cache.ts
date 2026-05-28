"use client";

import type { ChunkRef } from "@/lib/discord";

// ── Module-level in-memory cache ─────────────────────────────────────────────
// Stores compressed JPEG data URLs (not blob URLs) so memory stays small and
// there's nothing to revoke. Persists for the browser session.
const cache = new Map<string, string>();

export function getThumbnail(fileId: string): string | null {
  return cache.get(fileId) ?? null;
}

// ── Types ─────────────────────────────────────────────────────────────────────

type DownloadArgs = {
  size: number;
  mimeType: string;
  filename: string;
  chunkSize: number;
  chunks: ChunkRef[];
};

type Client = {
  downloadFile: (args: DownloadArgs) => Promise<Blob>;
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Download a file, shrink it to at most `maxPx` on the longest side,
 * encode as JPEG, cache by fileId, and return the data URL.
 * Returns null on any error.
 */
export async function generateThumbnail(
  fileId: string,
  downloadArgs: DownloadArgs,
  client: Client,
  maxPx = 240,
): Promise<string | null> {
  const cached = cache.get(fileId);
  if (cached) return cached;

  try {
    const blob = await client.downloadFile(downloadArgs);
    if (!blob.type.startsWith("image/")) return null;

    const dataUrl = await blobToThumbnail(blob, maxPx);
    cache.set(fileId, dataUrl);
    return dataUrl;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function blobToThumbnail(blob: Blob, maxPx: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const tempUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(tempUrl);
      const scale = Math.min(maxPx / img.naturalWidth, maxPx / img.naturalHeight, 1);
      const w = Math.round(img.naturalWidth * scale);
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas 2d unavailable")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };

    img.onerror = () => {
      URL.revokeObjectURL(tempUrl);
      reject(new Error("image load failed"));
    };

    img.src = tempUrl;
  });
}
