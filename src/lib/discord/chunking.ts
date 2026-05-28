import { DEFAULT_CHUNK_SIZE } from "./constants";

/**
 * Compute the chunk slices for a given file size.
 *
 * Returns an array of [start, end) byte ranges. The last chunk may be smaller
 * than `chunkSize`. We do NOT actually read or copy the file bytes here —
 * the caller uses File.slice(start, end) which is a zero-copy operation that
 * returns a lazy Blob view.
 */
export function planChunks(
  totalSize: number,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): Array<{ index: number; start: number; end: number; size: number }> {
  if (totalSize <= 0) return [];
  const chunks: Array<{
    index: number;
    start: number;
    end: number;
    size: number;
  }> = [];
  let i = 0;
  for (let start = 0; start < totalSize; start += chunkSize) {
    const end = Math.min(start + chunkSize, totalSize);
    chunks.push({ index: i, start, end, size: end - start });
    i++;
  }
  return chunks;
}

/**
 * Parse the Unix-ms expiration timestamp from a Discord CDN URL.
 *
 * Discord CDN URLs since 2023 carry an `ex` query parameter — a Unix
 * timestamp in seconds, hex-encoded, after which the signed URL becomes
 * invalid. Returns 0 if the parameter is missing or unparseable.
 */
export function parseCdnExpiry(url: string): number {
  try {
    const u = new URL(url);
    const ex = u.searchParams.get("ex");
    if (!ex) return 0;
    const seconds = parseInt(ex, 16);
    if (!Number.isFinite(seconds)) return 0;
    return seconds * 1000;
  } catch {
    return 0;
  }
}
