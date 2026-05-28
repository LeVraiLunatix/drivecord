/**
 * Types for the Discord webhook client.
 *
 * Discord docs:
 *  - Webhooks: https://discord.com/developers/docs/resources/webhook
 *  - Channel messages: https://discord.com/developers/docs/resources/channel
 *
 * Note on CDN URL expiration:
 *  Since 2023, Discord attachment URLs include an `ex` query parameter and
 *  expire after ~24h. We refresh them by GET-ing the parent message via the
 *  webhook API.
 */

/** Parsed webhook URL. */
export type WebhookRef = {
  /** Webhook snowflake ID. */
  id: string;
  /** Webhook secret token. Treat as sensitive. */
  token: string;
  /** Original URL string. */
  url: string;
};

/** Webhook info returned by GET /webhooks/{id}/{token}. */
export type WebhookInfo = {
  id: string;
  type: number;
  token: string;
  name: string | null;
  channel_id: string;
  guild_id?: string;
  avatar: string | null;
  application_id: string | null;
};

/** Discord attachment object (subset). */
export type DiscordAttachment = {
  id: string;
  filename: string;
  size: number;
  url: string;
  proxy_url: string;
  content_type?: string;
  width?: number;
  height?: number;
};

/** Discord message object (subset). */
export type DiscordMessage = {
  id: string;
  channel_id: string;
  webhook_id?: string;
  attachments: DiscordAttachment[];
  timestamp: string;
};

/**
 * Reference to a single uploaded chunk, persisted in IndexedDB.
 * Enough info to download + refresh CDN URL when expired.
 */
export type ChunkRef = {
  /** Order of this chunk in the file (0-indexed). */
  index: number;
  /** Byte size of this chunk. */
  size: number;
  /** ID of the Discord message containing this chunk. */
  messageId: string;
  /** ID of the attachment within that message. */
  attachmentId: string;
  /** Last known CDN URL. May be expired. */
  url: string;
  /** Unix ms timestamp when `url` expires (parsed from `ex` query param). */
  expiresAt: number;
};

/** Manifest of an uploaded file. Stored in IndexedDB metadata. */
export type FileManifest = {
  /** Total size in bytes (sum of chunks). */
  size: number;
  /** Detected MIME type, may be empty string. */
  mimeType: string;
  /** Original filename at upload time. */
  filename: string;
  /** All chunks in order. */
  chunks: ChunkRef[];
  /** Chunk size used at upload time (last chunk may be smaller). */
  chunkSize: number;
};

/** Progress event emitted during upload. */
export type UploadProgress = {
  /** Bytes uploaded across all chunks so far. */
  loaded: number;
  /** Total bytes to upload. */
  total: number;
  /** Number of chunks fully uploaded. */
  chunksDone: number;
  /** Total chunks. */
  chunksTotal: number;
};

/** Progress event emitted during download. */
export type DownloadProgress = {
  loaded: number;
  total: number;
  chunksDone: number;
  chunksTotal: number;
};

/** Error categories used by retry logic. */
export type DiscordErrorCategory =
  | "rate_limited"
  | "transient"
  | "permanent"
  | "network";

export class DiscordApiError extends Error {
  category: DiscordErrorCategory;
  status?: number;
  retryAfterMs?: number;
  body?: unknown;

  constructor(
    message: string,
    opts: {
      category: DiscordErrorCategory;
      status?: number;
      retryAfterMs?: number;
      body?: unknown;
    },
  ) {
    super(message);
    this.name = "DiscordApiError";
    this.category = opts.category;
    this.status = opts.status;
    this.retryAfterMs = opts.retryAfterMs;
    this.body = opts.body;
  }
}
