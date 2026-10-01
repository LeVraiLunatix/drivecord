/**
 * Pure rules for chunked API uploads — no database, no network — so they can
 * be unit-tested exhaustively. The routes and `upload-sessions.ts` wire them up.
 *
 * Trust model: a finalize request names an `uploadId`, never chunks. The chunk
 * list is rebuilt from rows this server wrote itself while relaying each chunk
 * to the key's own webhook. The legacy `chunks[]` body is still accepted for
 * old clients, but every reference is re-checked against Discord.
 */
import { isDiscordCdnUrl, isSnowflake, parseCdnExpiry } from "./discord";
import type { ChunkRef, DiscordMessage } from "./discord";

export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
export const MAX_CHUNKS = 10_000;
/** Open sessions a single key may have at once (caps abandoned-upload buildup). */
export const MAX_OPEN_SESSIONS_PER_KEY = 20;

export class UploadError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "UploadError";
    this.status = status;
  }
}

export type SessionLike = {
  apiKeyId: string;
  webhookId: string;
  status: string;
  expiresAt: Date;
  expectedChunks: number | null;
};

/** The session must belong to THIS key + webhook, be open and unexpired. */
export function assertSessionUsable(
  session: SessionLike | null,
  owner: { apiKeyId: string; webhookId: string },
  now = Date.now(),
): asserts session is SessionLike {
  // Same 404 whether it doesn't exist or belongs to someone else: no probing.
  if (!session || session.apiKeyId !== owner.apiKeyId || session.webhookId !== owner.webhookId) {
    throw new UploadError(404, "Session d'upload introuvable.");
  }
  if (session.status !== "open") throw new UploadError(409, "Cette session d'upload est déjà terminée.");
  if (session.expiresAt.getTime() <= now) throw new UploadError(410, "Cette session d'upload a expiré.");
}

export function parseChunkIndex(raw: unknown): number {
  const n = typeof raw === "string" && raw.trim() !== "" ? Number(raw) : raw;
  if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n >= MAX_CHUNKS) {
    throw new UploadError(400, `\`index\` doit être un entier entre 0 et ${MAX_CHUNKS - 1}.`);
  }
  return n;
}

/** Indexes must be exactly 0..n-1 (no gap, no duplicate), and match `expected` when set. */
export function assertContiguous(indexes: number[], expected?: number | null): void {
  if (indexes.length === 0) throw new UploadError(400, "Aucun morceau envoyé.");
  if (indexes.length > MAX_CHUNKS) throw new UploadError(400, `Trop de morceaux (max ${MAX_CHUNKS}).`);
  const sorted = [...indexes].sort((a, b) => a - b);
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] !== i) {
      throw new UploadError(
        400,
        `Morceaux non contigus : le morceau ${i} est manquant ou dupliqué (attendu 0 à ${sorted.length - 1}).`,
      );
    }
  }
  if (expected != null && expected !== indexes.length) {
    throw new UploadError(400, `Nombre de morceaux inattendu : ${indexes.length} reçus, ${expected} annoncés.`);
  }
}

/** If the client announced a total size, it must equal what we actually stored. */
export function assertSizeMatches(total: number, announced: unknown): void {
  if (announced === undefined || announced === null) return;
  if (typeof announced !== "number" || !Number.isFinite(announced) || announced !== total) {
    throw new UploadError(400, `La taille annoncée (${String(announced)}) ne correspond pas aux morceaux reçus (${total}).`);
  }
}

export type StoredChunk = {
  index: number;
  size: number;
  messageId: string;
  attachmentId: string;
  url: string;
  urlExpiresAt: Date | null;
};

export function toChunkRefs(rows: StoredChunk[]): ChunkRef[] {
  return [...rows]
    .sort((a, b) => a.index - b.index)
    .map((r) => ({
      index: r.index,
      size: r.size,
      messageId: r.messageId,
      attachmentId: r.attachmentId,
      url: r.url,
      expiresAt: r.urlExpiresAt?.getTime() ?? 0,
    }));
}

// ── Legacy `chunks[]` finalize ───────────────────────────────────────────────

export type ClientChunk = { index?: unknown; messageId?: unknown; attachmentId?: unknown };
export type MessageFetcher = { getMessage(messageId: string): Promise<DiscordMessage | null> };

const LEGACY_CONCURRENCY = 5;

/**
 * Rebuild trustworthy chunk refs from a client-supplied list. Only the ids are
 * read from the client: `url`, `size` and `expiresAt` are IGNORED and taken
 * from Discord's answer — for a message fetched with this key's own webhook.
 */
export async function resolveLegacyChunks(
  client: MessageFetcher,
  input: ClientChunk[],
): Promise<ChunkRef[]> {
  if (input.length === 0 || input.length > MAX_CHUNKS) {
    throw new UploadError(400, `Liste de morceaux invalide (1 à ${MAX_CHUNKS}).`);
  }
  const parsed = input.map((c) => {
    if (!c || typeof c !== "object") throw new UploadError(400, "Un ou plusieurs chunks sont mal formés.");
    const index = parseChunkIndex(c.index);
    if (!isSnowflake(c.messageId) || !isSnowflake(c.attachmentId)) {
      throw new UploadError(400, "Un ou plusieurs chunks sont mal formés.");
    }
    return { index, messageId: c.messageId, attachmentId: c.attachmentId };
  });
  assertContiguous(parsed.map((c) => c.index));
  if (new Set(parsed.map((c) => c.messageId)).size !== parsed.length) {
    throw new UploadError(400, "Un message Discord est référencé plusieurs fois.");
  }

  const out: ChunkRef[] = new Array(parsed.length);
  for (let i = 0; i < parsed.length; i += LEGACY_CONCURRENCY) {
    await Promise.all(
      parsed.slice(i, i + LEGACY_CONCURRENCY).map(async (c, j) => {
        const msg = await client.getMessage(c.messageId);
        const att = msg?.attachments.find((a) => a.id === c.attachmentId);
        if (!msg || !att || !isDiscordCdnUrl(att.url)) {
          throw new UploadError(400, "Un des morceaux n'existe pas sur ce drive.");
        }
        out[i + j] = {
          index: c.index,
          size: att.size,
          messageId: c.messageId,
          attachmentId: att.id,
          url: att.url,
          expiresAt: parseCdnExpiry(att.url),
        };
      }),
    );
  }
  return out.sort((a, b) => a.index - b.index);
}
