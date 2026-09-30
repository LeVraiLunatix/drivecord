/**
 * Public representation of drive items in `/api/v2`.
 *
 * Deliberately narrower than v1's `FileEntry`: no `chunks` (they embed Discord
 * message/attachment ids and signed CDN URLs), no `encIv`, no `webhookId`.
 * Timestamps are ISO-8601 strings.
 */
type FileRow = {
  id: string;
  parentId: string;
  filename: string;
  size: number;
  mimeType: string;
  tags: string[];
  favorite: boolean;
  encIv: string | null;
  trashed: boolean;
  trashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FolderRow = {
  id: string;
  parentId: string;
  name: string;
  color: string | null;
  trashed: boolean;
  trashedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeFile(row: FileRow) {
  return {
    id: row.id,
    parentId: row.parentId,
    filename: row.filename,
    size: row.size,
    mimeType: row.mimeType,
    tags: row.tags,
    favorite: row.favorite,
    encrypted: row.encIv !== null,
    trashed: row.trashed,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function serializeFolder(row: FolderRow) {
  return {
    id: row.id,
    parentId: row.parentId,
    name: row.name,
    color: row.color,
    trashed: row.trashed,
    trashedAt: row.trashedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** Filename safe for a `Content-Disposition` header (no CR/LF/quotes/non-ASCII in the fallback). */
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\;]/g, "_") || "download";
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeRFC5987(filename)}`;
}

function encodeRFC5987(s: string): string {
  return encodeURIComponent(s).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

/** Only pass through a well-formed `type/subtype`; anything else becomes octet-stream. */
export function safeContentType(mime: string): string {
  return /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/i.test(mime)
    ? mime
    : "application/octet-stream";
}
