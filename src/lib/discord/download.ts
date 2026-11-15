import { proxyUrl } from "./proxy";
import { withRetry } from "./retry";
import { parseDiscordError } from "./errors";
import { DiscordApiError, type ChunkRef, type DownloadProgress } from "./types";

export type DownloadChunksOptions = {
  parallel?: number;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
  /** Total bytes, for progress only. */
  totalSize?: number;
  /** Fresh URL for a chunk whose CDN link expired (needs the webhook; absent for anonymous share pages). */
  refresh?: (chunk: ChunkRef) => Promise<ChunkRef>;
};

/**
 * Fetch the chunks of a file in parallel and hand them to `write` IN ORDER.
 * At most `parallel + 2` chunks are held in memory at once, so a 4 GB file costs the same RAM as
 * a 40 MB one — the caller decides whether to keep the parts (Blob) or stream them to disk.
 */
export async function downloadChunks(
  chunks: ChunkRef[],
  write: (part: Blob, position: number) => Promise<void>,
  opts: DownloadChunksOptions = {},
): Promise<void> {
  const { signal, refresh } = opts;
  const list = [...chunks].sort((a, b) => a.index - b.index);
  const n = list.length;
  const parallel = Math.max(1, opts.parallel ?? 6);
  const window = parallel + 2;

  const ready = new Map<number, Blob>();
  let fetchCursor = 0;
  let writeCursor = 0;
  let bytes = 0;
  let failure: unknown;
  let failed = false;
  const waiters: (() => void)[] = [];
  const wake = () => waiters.splice(0).forEach((f) => f());
  const changed = () => new Promise<void>((r) => waiters.push(r));
  const fail = (e: unknown) => {
    if (!failed) { failed = true; failure = e; }
    wake();
  };
  const emit = () =>
    opts.onProgress?.({ loaded: bytes, total: opts.totalSize ?? 0, chunksDone: writeCursor, chunksTotal: n });
  emit();

  const fetchOne = async (original: ChunkRef): Promise<Blob> => {
    let chunk = original;
    // Eager refresh when the signed URL is about to expire (30 s margin).
    if (refresh && chunk.expiresAt > 0 && chunk.expiresAt - Date.now() < 30_000) chunk = await refresh(chunk);
    return withRetry(async (attempt) => {
      let res = await fetch(proxyUrl(chunk.url), { signal });
      if ((res.status === 403 || res.status === 404) && refresh) {
        chunk = await refresh(chunk); // expired despite our check — once more
        res = await fetch(proxyUrl(chunk.url), { signal });
      }
      if (!res.ok) throw await parseDiscordError(res);
      const blob = await res.blob();
      // A truncated body with a 200 would otherwise be saved as a silently corrupt file.
      if (chunk.size > 0 && blob.size !== chunk.size) {
        throw new DiscordApiError(`Morceau ${chunk.index} incomplet (${blob.size}/${chunk.size} octets).`, {
          category: attempt < 2 ? "transient" : "permanent",
        });
      }
      return blob;
    }, signal);
  };

  const worker = async () => {
    try {
      while (true) {
        if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
        while (!failed && fetchCursor - writeCursor >= window) await changed();
        if (failed) return;
        const i = fetchCursor++;
        if (i >= n) return;
        ready.set(i, await fetchOne(list[i]!));
        wake();
      }
    } catch (e) {
      fail(e);
    }
  };

  const consumer = async () => {
    try {
      for (let i = 0; i < n; i++) {
        while (!ready.has(i)) {
          if (failed) throw failure;
          await changed();
        }
        const part = ready.get(i)!;
        ready.delete(i);
        await write(part, i);
        bytes += part.size;
        writeCursor = i + 1;
        emit();
        wake();
      }
    } catch (e) {
      fail(e);
      throw e;
    }
  };

  await Promise.all([consumer(), ...Array.from({ length: Math.min(parallel, n) }, worker)]);
}
