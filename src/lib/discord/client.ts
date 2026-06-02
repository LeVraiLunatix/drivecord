import {
  DEFAULT_CHUNK_SIZE,
  DEFAULT_PARALLEL_DOWNLOADS,
  DEFAULT_PARALLEL_UPLOADS,
  DISCORD_API_BASE,
} from "./constants";
import { parseDiscordError } from "./errors";
import { withRetry } from "./retry";
import { planChunks, parseCdnExpiry } from "./chunking";
import { proxyUrl } from "./proxy";
import { hashWebhook, parseWebhookUrl, fetchWebhookInfo } from "./webhook";
import {
  DiscordApiError,
  type ChunkRef,
  type DiscordMessage,
  type DownloadProgress,
  type FileManifest,
  type UploadProgress,
  type WebhookInfo,
  type WebhookRef,
} from "./types";

export type UploadOptions = {
  chunkSize?: number;
  parallel?: number;
  signal?: AbortSignal;
  onProgress?: (p: UploadProgress) => void;
};

export type DownloadOptions = {
  parallel?: number;
  signal?: AbortSignal;
  onProgress?: (p: DownloadProgress) => void;
};

/**
 * High-level Discord webhook client.
 *
 * One instance is bound to one webhook URL. All file ops run client-side from
 * the browser directly to discord.com — there is no Next.js API route in the
 * middle. This keeps the architecture local-first and avoids leaking the
 * token to a server.
 */
export class DiscordClient {
  readonly ref: WebhookRef;

  constructor(ref: WebhookRef) {
    this.ref = ref;
  }

  /** Construct from a raw URL string. Throws if URL is invalid. */
  static fromUrl(url: string): DiscordClient {
    const ref = parseWebhookUrl(url);
    if (!ref) {
      throw new DiscordApiError("Invalid Discord webhook URL", {
        category: "permanent",
      });
    }
    return new DiscordClient(ref);
  }

  /** Stable SHA-256 hex digest of this webhook. Used as drive ID. */
  driveId(): Promise<string> {
    return hashWebhook(this.ref);
  }

  /** Validate webhook & return server info. */
  info(signal?: AbortSignal): Promise<WebhookInfo> {
    return fetchWebhookInfo(this.ref, signal);
  }

  private get baseUrl(): string {
    return `${DISCORD_API_BASE}/webhooks/${this.ref.id}/${this.ref.token}`;
  }

  /**
   * Upload one chunk as a single webhook message.
   * Returns the created message (with attachment info).
   */
  private async uploadChunk(
    blob: Blob,
    filename: string,
    signal?: AbortSignal,
  ): Promise<DiscordMessage> {
    return withRetry(async () => {
      const form = new FormData();
      // The `?wait=true` query is mandatory to get the message back synchronously.
      form.append("files[0]", blob, filename);

      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}?wait=true`, {
          method: "POST",
          body: form,
          signal,
        });
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") throw err;
        throw new DiscordApiError(
          `Network error during chunk upload: ${(err as Error).message}`,
          { category: "network" },
        );
      }

      if (!res.ok) throw await parseDiscordError(res);
      return (await res.json()) as DiscordMessage;
    }, signal);
  }

  /**
   * Upload a File / Blob in chunks, in parallel.
   *
   * Returns a FileManifest describing all chunks. Persisting that manifest
   * is the caller's responsibility (we don't touch IndexedDB here).
   */
  async uploadFile(
    file: File | Blob,
    opts: UploadOptions & { filename?: string } = {},
  ): Promise<FileManifest> {
    const filename =
      opts.filename ?? (file instanceof File ? file.name : "blob");
    const mimeType = (file as File).type ?? "";
    const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const parallel = Math.max(1, opts.parallel ?? DEFAULT_PARALLEL_UPLOADS);
    const signal = opts.signal;

    const plan = planChunks(file.size, chunkSize);
    if (plan.length === 0) {
      // Empty file — still record one zero-byte chunk so downloads work.
      return {
        size: 0,
        mimeType,
        filename,
        chunkSize,
        chunks: [],
      };
    }

    const results: (ChunkRef | undefined)[] = new Array(plan.length);
    let bytesDone = 0;
    let chunksDone = 0;
    const emit = () => {
      opts.onProgress?.({
        loaded: bytesDone,
        total: file.size,
        chunksDone,
        chunksTotal: plan.length,
      });
    };
    emit();

    // Worker-pool pattern: keep `parallel` in-flight at all times.
    let cursor = 0;
    const errors: unknown[] = [];

    const worker = async () => {
      while (true) {
        if (signal?.aborted)
          throw new DOMException("Aborted", "AbortError");
        if (errors.length > 0) return;
        const myIdx = cursor++;
        if (myIdx >= plan.length) return;
        const { index, start, end, size } = plan[myIdx];
        const slice = file.slice(start, end);
        const chunkName =
          plan.length > 1 ? `${filename}.part${index}` : filename;
        try {
          const msg = await this.uploadChunk(slice, chunkName, signal);
          const att = msg.attachments[0];
          if (!att) {
            throw new DiscordApiError(
              `Chunk ${index} uploaded but no attachment returned`,
              { category: "transient" },
            );
          }
          results[index] = {
            index,
            size,
            messageId: msg.id,
            attachmentId: att.id,
            url: att.url,
            expiresAt: parseCdnExpiry(att.url),
          };
          bytesDone += size;
          chunksDone += 1;
          emit();
        } catch (err) {
          errors.push(err);
          return;
        }
      }
    };

    const workers = Array.from({ length: Math.min(parallel, plan.length) }, () =>
      worker(),
    );
    await Promise.all(workers);
    if (errors.length > 0) throw errors[0];

    const chunks = results.filter((c): c is ChunkRef => Boolean(c));
    if (chunks.length !== plan.length) {
      throw new DiscordApiError(
        `Upload incomplete: ${chunks.length}/${plan.length} chunks succeeded`,
        { category: "transient" },
      );
    }
    return {
      size: file.size,
      mimeType,
      filename,
      chunkSize,
      chunks,
    };
  }

  /**
   * Upload directly from a ReadableStream, chunk by chunk, WITHOUT holding the
   * whole file in memory (used for large camera-roll videos). Reads the stream,
   * fills a chunkSize buffer, uploads it, repeats. Sequential by design.
   */
  async uploadStream(
    stream: ReadableStream<Uint8Array>,
    opts: {
      filename: string;
      mimeType?: string;
      totalSize?: number;
      chunkSize?: number;
      signal?: AbortSignal;
      onProgress?: (p: UploadProgress) => void;
    },
  ): Promise<FileManifest> {
    const chunkSize = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
    const mimeType = opts.mimeType ?? "";
    const reader = stream.getReader();
    const chunks: ChunkRef[] = [];
    let index = 0;
    let bytesDone = 0;

    // Pending byte queue (array of Uint8Array views) with O(1) length tracking.
    const pending: Uint8Array[] = [];
    let pendingLen = 0;

    const take = (n: number): Uint8Array => {
      const out = new Uint8Array(n);
      let off = 0;
      while (off < n) {
        const head = pending[0];
        const need = n - off;
        if (head.length <= need) {
          out.set(head, off); off += head.length; pending.shift();
        } else {
          out.set(head.subarray(0, need), off); pending[0] = head.subarray(need); off += need;
        }
      }
      pendingLen -= n;
      return out;
    };

    const flush = async (bytes: Uint8Array) => {
      if (opts.signal?.aborted) throw new DOMException("Aborted", "AbortError");
      const blob = new Blob([bytes as BlobPart], { type: mimeType || "application/octet-stream" });
      const name = `${opts.filename}.part${index}`;
      const msg = await this.uploadChunk(blob, name, opts.signal);
      const att = msg.attachments[0];
      if (!att) throw new DiscordApiError(`Chunk ${index} returned no attachment`, { category: "transient" });
      chunks.push({ index, size: bytes.length, messageId: msg.id, attachmentId: att.id, url: att.url, expiresAt: parseCdnExpiry(att.url) });
      index += 1;
      bytesDone += bytes.length;
      opts.onProgress?.({ loaded: bytesDone, total: opts.totalSize ?? bytesDone, chunksDone: index, chunksTotal: -1 });
    };

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value && value.length) { pending.push(value); pendingLen += value.length; }
      while (pendingLen >= chunkSize) await flush(take(chunkSize));
    }
    if (pendingLen > 0) await flush(take(pendingLen));

    return { size: bytesDone, mimeType, filename: opts.filename, chunkSize, chunks };
  }

  /**
   * Refresh a single chunk's CDN URL by re-fetching its parent message.
   * Returns the updated ChunkRef (the caller should persist it).
   */
  async refreshChunkUrl(chunk: ChunkRef): Promise<ChunkRef> {
    return withRetry(async () => {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/messages/${chunk.messageId}`, {
          method: "GET",
        });
      } catch (err) {
        throw new DiscordApiError(
          `Network error refreshing chunk URL: ${(err as Error).message}`,
          { category: "network" },
        );
      }
      if (!res.ok) throw await parseDiscordError(res);
      const msg = (await res.json()) as DiscordMessage;
      const att = msg.attachments.find((a) => a.id === chunk.attachmentId);
      if (!att) {
        throw new DiscordApiError(
          `Attachment ${chunk.attachmentId} not found in message ${chunk.messageId}`,
          { category: "permanent" },
        );
      }
      return {
        ...chunk,
        url: att.url,
        expiresAt: parseCdnExpiry(att.url),
      };
    });
  }

  /**
   * Download all chunks of a file and return a Blob with the original bytes.
   *
   * For large files, prefer `downloadStream` (TODO Phase 5) which streams
   * directly to disk via the File System Access API instead of materializing
   * everything in memory.
   */
  async downloadFile(
    manifest: FileManifest,
    opts: DownloadOptions = {},
  ): Promise<Blob> {
    const parallel = Math.max(1, opts.parallel ?? DEFAULT_PARALLEL_DOWNLOADS);
    const signal = opts.signal;

    const parts: (Blob | undefined)[] = new Array(manifest.chunks.length);
    let bytesDone = 0;
    let chunksDone = 0;
    const emit = () => {
      opts.onProgress?.({
        loaded: bytesDone,
        total: manifest.size,
        chunksDone,
        chunksTotal: manifest.chunks.length,
      });
    };
    emit();

    let cursor = 0;
    const errors: unknown[] = [];
    const refreshed = new Map<number, ChunkRef>();

    const worker = async () => {
      while (true) {
        if (signal?.aborted)
          throw new DOMException("Aborted", "AbortError");
        if (errors.length > 0) return;
        const myIdx = cursor++;
        if (myIdx >= manifest.chunks.length) return;
        const original = manifest.chunks[myIdx];
        try {
          let chunk = original;
          // Refresh URL eagerly if expired (with a 30s safety margin).
          if (chunk.expiresAt > 0 && chunk.expiresAt - Date.now() < 30_000) {
            chunk = await this.refreshChunkUrl(chunk);
            refreshed.set(chunk.index, chunk);
          }

          const blob = await withRetry(async () => {
            // Route Discord CDN through our same-origin proxy (CORS).
            const res = await fetch(proxyUrl(chunk.url), { signal });
            if (res.status === 403 || res.status === 404) {
              // CDN URL likely expired despite our check — refresh once more.
              const fresh = await this.refreshChunkUrl(chunk);
              refreshed.set(fresh.index, fresh);
              const res2 = await fetch(proxyUrl(fresh.url), { signal });
              if (!res2.ok) throw await parseDiscordError(res2);
              return await res2.blob();
            }
            if (!res.ok) throw await parseDiscordError(res);
            return await res.blob();
          }, signal);

          parts[myIdx] = blob;
          bytesDone += chunk.size;
          chunksDone += 1;
          emit();
        } catch (err) {
          errors.push(err);
          return;
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(parallel, manifest.chunks.length) },
      () => worker(),
    );
    await Promise.all(workers);
    if (errors.length > 0) throw errors[0];

    const ordered = parts.filter((p): p is Blob => Boolean(p));
    return new Blob(ordered, { type: manifest.mimeType || undefined });
  }

  /** Delete a chunk's message from Discord. */
  async deleteChunk(chunk: ChunkRef): Promise<void> {
    return withRetry(async () => {
      let res: Response;
      try {
        res = await fetch(`${this.baseUrl}/messages/${chunk.messageId}`, {
          method: "DELETE",
        });
      } catch (err) {
        throw new DiscordApiError(
          `Network error deleting chunk: ${(err as Error).message}`,
          { category: "network" },
        );
      }
      // 404 = already gone; treat as success.
      if (res.status === 404) return;
      if (!res.ok) throw await parseDiscordError(res);
    });
  }

  /** Delete all chunks of a file. Errors are aggregated. */
  async deleteFile(manifest: FileManifest): Promise<void> {
    const errors: unknown[] = [];
    for (const chunk of manifest.chunks) {
      try {
        await this.deleteChunk(chunk);
      } catch (err) {
        errors.push(err);
      }
    }
    if (errors.length > 0) {
      throw new DiscordApiError(
        `Failed to delete ${errors.length}/${manifest.chunks.length} chunks`,
        { category: "transient", body: errors },
      );
    }
  }
}
