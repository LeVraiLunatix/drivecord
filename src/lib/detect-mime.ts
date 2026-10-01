/**
 * Don't trust the client's `Content-Type` / filename for what a file IS:
 * sniff the magic bytes. When the content is recognised, that type wins.
 * Unrecognisable content (plain text, CSV, …) keeps the announced type if it
 * is well-formed, else `application/octet-stream`. (Serving is still
 * constrained independently by `safe-file-headers.ts`.)
 */
import { fileTypeFromBuffer } from "file-type";
import { isWellFormedMime, normalizeMime } from "./safe-file-headers";

const SNIFF_BYTES = 4100;

export async function detectMime(head: Uint8Array, announced: string | null | undefined): Promise<string> {
  try {
    const detected = await fileTypeFromBuffer(head.subarray(0, SNIFF_BYTES));
    if (detected) return detected.mime;
  } catch {
    /* fall through to the announced type */
  }
  return isWellFormedMime(announced) ? normalizeMime(announced) : "application/octet-stream";
}
