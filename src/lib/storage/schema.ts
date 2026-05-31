/**
 * IndexedDB schema for Drivecord.
 *
 * One DB across all drives. Entities reference the parent drive via `driveId`.
 * - `drives`  : one row per webhook (the "account")
 * - `folders` : virtual folders, tree via `parentId` (null = drive root)
 * - `files`   : uploaded files, also tree via `parentId`
 * - `shares`  : public share tokens (filled in Phase 7)
 *
 * Conventions:
 *  - Timestamps: Unix ms (Date.now())
 *  - IDs: nanoid for everything we create; Discord IDs are kept as strings.
 *  - Soft delete: `trashed=true` + `trashedAt` so the user can restore.
 */

import type { ChunkRef } from "@/lib/discord";

/** One per webhook. */
export type Drive = {
  /** SHA-256 hex of `${id}:${token}`. Stable across reconnects. */
  id: string;
  /** Full webhook URL. Stored locally only (never sent anywhere). */
  webhookUrl: string;
  /** User-friendly name (defaults to webhook name from Discord). */
  name: string;
  /** Discord channel ID (informational). */
  channelId: string;
  /** Discord guild ID, if known. */
  guildId?: string;
  /** When this drive was added in Drivecord. */
  createdAt: number;
  /** Last time the user opened this drive. */
  lastOpenedAt: number;
};

/** Sentinel used for `parentId` to mean "drive root".
 *  We avoid `null` because IndexedDB does not index rows where any part of a
 *  compound key is `null`/`undefined`. */
export const ROOT_PARENT = "" as const;
export type ParentId = string; // "" = root, otherwise a folder id

/** A folder is a pure metadata node — Discord has no notion of folders. */
export type FolderEntry = {
  id: string;
  driveId: string;
  /** Parent folder id, or `ROOT_PARENT` ("") for the drive root. */
  parentId: ParentId;
  name: string;
  createdAt: number;
  updatedAt: number;
  trashed: boolean;
  trashedAt?: number;
  /** Optional display color key (see FOLDER_COLOR_PRESETS in lib/folder-colors.ts). */
  color?: string;
};

/** A file is a manifest pointing at one or more Discord messages. */
export type FileEntry = {
  id: string;
  driveId: string;
  /** Parent folder id, or `ROOT_PARENT` ("") for the drive root. */
  parentId: ParentId;
  filename: string;
  /** Total byte size (sum of chunk sizes). */
  size: number;
  /** Detected MIME type. May be empty. */
  mimeType: string;
  /** Chunk size used at upload time. */
  chunkSize: number;
  /** Ordered list of chunks (kept in a single field on purpose — not a
   *  separate table — because we always read all chunks together). */
  chunks: ChunkRef[];
  createdAt: number;
  updatedAt: number;
  /** Optional user tags. Multi-entry indexed for fast filtering. */
  tags: string[];
  /** Starred / favorited. */
  favorite: boolean;
  /** In the locked vault (hidden from normal views, requires PIN/biometric). */
  locked?: boolean;
  /** base64 AES-GCM IV — present iff the file content is E2EE encrypted. */
  encIv?: string;
  /** Soft delete flag. */
  trashed: boolean;
  trashedAt?: number;
  /** Phase 6 — present iff the file content is E2EE encrypted. */
  encryption?: FileEncryptionMeta;
};

/** Encryption metadata for a single file (filled in Phase 6). */
export type FileEncryptionMeta = {
  algorithm: "AES-GCM";
  /** PBKDF2 salt, base64. */
  keySalt: string;
  /** Initial IV, base64. Each chunk uses iv ^ index. */
  iv: string;
  /** PBKDF2 iterations. */
  iterations: number;
};

/** A public share token (Phase 7). */
export type ShareEntry = {
  id: string;
  driveId: string;
  fileId: string;
  token: string;
  /** Optional password (PBKDF2 hash). */
  passwordHash?: string;
  expiresAt?: number;
  maxDownloads?: number;
  downloads: number;
  createdAt: number;
};

/** Union type for the file explorer (folders + files mixed). */
export type DriveItem =
  | ({ kind: "folder" } & FolderEntry)
  | ({ kind: "file" } & FileEntry);
