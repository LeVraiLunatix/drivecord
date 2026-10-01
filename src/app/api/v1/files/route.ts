/**
 * GET  /api/v1/files  — list files in the drive (optionally by folder)
 * POST /api/v1/files  — create a file, two ways:
 *   1. multipart/form-data (`file`, optional `parentId`/`filename`) — simple
 *      one-shot upload, bound by the platform's request body size limit.
 *   2. application/json ({ filename, uploadId, mimeType?, parentId?, size? }) —
 *      finalize a file whose chunks were uploaded via `POST /api/v1/files/chunks`.
 *      The chunk list is rebuilt from the server's own records of that upload.
 *      (Legacy: `chunks: [{ index, messageId, attachmentId }]` is still accepted
 *      and every reference is verified against Discord — see upload-session-core.)
 *
 * Files uploaded here are stored as plaintext (no client-side E2EE key exists
 * for a server-to-server caller) — unlike files uploaded from the web app.
 */
import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { decryptUrl } from "@/lib/auth/encrypt";
import { toFileEntry } from "@/app/api/drive/_helpers";
import { DiscordClient, DEFAULT_CHUNK_SIZE, fetchDiscordCdn } from "@/lib/discord";
import type { ChunkRef } from "@/lib/discord";
import { detectMime } from "@/lib/detect-mime";
import { HttpError } from "@/lib/api-v1/errors";
import { assertFileQuota, assertParentUsable, consumeByteQuota } from "@/lib/api-v1/guards";
import { finalizeSchema, nameSchema, parentIdSchema, parse, parseCursor, parseLimit, readJson } from "@/lib/api-v1/schemas";
import { json, preflight, v1Route, type V1Auth } from "@/lib/api-v1/pipeline";
import {
  assertContiguous,
  assertSessionUsable,
  assertSizeMatches,
  resolveLegacyChunks,
  toChunkRefs,
  UploadError,
} from "@/lib/upload-session-core";

export const runtime = "nodejs";

/** Requests to `/api/v1/files` go through our server (unlike the web app's
 *  direct browser-to-Discord uploads), so they're bound by the hosting
 *  platform's request body limit. Keep a conservative ceiling. */
const MAX_UPLOAD_BYTES = 45 * 1024 * 1024; // 45 MiB

export function OPTIONS() {
  return preflight();
}

export const GET = v1Route({ route: "/api/v1/files", scope: "files:read" }, async ({ req, auth }) => {
  const sp = req.nextUrl.searchParams;
  const recursive = sp.get("recursive") === "1";
  const updatedSinceRaw = sp.get("updatedSince");
  const cursor = parseCursor(sp.get("cursor"));
  const parentId = parse(parentIdSchema, sp.get("parentId") ?? "");
  // Vault (`locked`) files are zero-knowledge and never reachable through an API key.
  const base = { webhookId: auth.webhook.id, trashed: false, locked: false } as const;

  // ── Sync mode ──────────────────────────────────────────────────────────────
  // Triggered by `recursive`, `updatedSince` or `cursor`. Walks the whole drive
  // (or one folder), ordered by `updatedAt` so a client can page through with
  // `cursor` and, on later polls, ask only for what changed via `updatedSince`.
  // There are no deletion tombstones: a client detects removals by diffing a
  // full `recursive=1` listing against its local state.
  if (recursive || updatedSinceRaw !== null || cursor !== null) {
    const limit = parseLimit(sp.get("limit"), 200, 500);
    const and: Prisma.DriveFileWhereInput[] = [];

    if (updatedSinceRaw !== null) {
      const since = Number(updatedSinceRaw);
      if (!Number.isFinite(since) || since < 0) throw new HttpError(400, "Paramètre `updatedSince` invalide.");
      and.push({ updatedAt: { gt: new Date(since) } });
    }

    if (cursor !== null) {
      // Format: "<updatedAtMs>_<id>". Split on the FIRST underscore only —
      // nanoid ids can themselves contain "_".
      const sep = cursor.indexOf("_");
      const at = Number(cursor.slice(0, sep));
      const id = cursor.slice(sep + 1);
      if (sep < 1 || !Number.isFinite(at) || !id || Number.isNaN(new Date(at).getTime())) {
        throw new HttpError(400, "Paramètre `cursor` invalide.");
      }
      // Keyset pagination over the (updatedAt, id) order.
      and.push({ OR: [{ updatedAt: { gt: new Date(at) } }, { AND: [{ updatedAt: new Date(at) }, { id: { gt: id } }] }] });
    }

    const rows = await prisma.driveFile.findMany({
      where: { ...base, ...(recursive ? {} : { parentId }), ...(and.length > 0 ? { AND: and } : {}) },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
    });
    const last = rows[rows.length - 1];
    const nextCursor = rows.length === limit && last ? `${last.updatedAt.getTime()}_${last.id}` : null;
    return json({ files: rows.map(toFileEntry), nextCursor });
  }

  // ── Legacy mode ────────────────────────────────────────────────────────────
  const limit = parseLimit(sp.get("limit"), 100, 200);
  const rows = await prisma.driveFile.findMany({
    where: { ...base, parentId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return json({ files: rows.map(toFileEntry) });
});

export const POST = v1Route({ route: "/api/v1/files", scope: "files:write" }, async ({ req, auth }) => {
  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    return finalizeChunkedUpload(req, auth);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Corps de requête invalide (attendu: multipart/form-data).");
  }

  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Champ `file` manquant.");
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new HttpError(413, `Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} Mio).`);
  }
  const parentId = parse(parentIdSchema, String(form.get("parentId") ?? ""));
  const filename = parse(nameSchema, String(form.get("filename") ?? (file.name || "fichier")));

  await assertParentUsable(auth.webhook.id, parentId);
  await assertFileQuota(auth.webhook.id);
  await consumeByteQuota(auth.apiKey.userId, file.size);

  // The client's Content-Type is a claim, not a fact: trust the bytes.
  const mimeType = await detectMime(new Uint8Array(await file.slice(0, 4100).arrayBuffer()), file.type);

  const client = DiscordClient.fromUrl(decryptUrl(auth.webhook.encryptedUrl));
  const manifest = await client.uploadFile(file, { filename, chunkSize: DEFAULT_CHUNK_SIZE });

  const row = await prisma.driveFile.create({
    data: {
      id: nanoid(12),
      webhookId: auth.webhook.id,
      driveId: auth.webhook.driveId,
      parentId,
      filename: manifest.filename,
      size: BigInt(Math.max(0, Math.trunc(manifest.size))),
      mimeType,
      chunkSize: manifest.chunkSize,
      chunks: manifest.chunks,
      tags: [],
    },
  });
  return json(toFileEntry(row), { status: 201 });
});

/** Sniff the real type from the first bytes of chunk 0 (best-effort; falls back to the claim). */
async function sniffMime(first: ChunkRef | undefined, claimed: string | undefined): Promise<string> {
  const fallback = claimed ? claimed.split(";")[0]!.trim().toLowerCase() : "application/octet-stream";
  if (!first) return fallback;
  try {
    const res = await fetchDiscordCdn(first.url, { headers: { Range: "bytes=0-4099" }, signal: AbortSignal.timeout(5000) });
    if (!res.ok) return fallback;
    return await detectMime(new Uint8Array(await res.arrayBuffer()).subarray(0, 4100), claimed);
  } catch {
    return fallback;
  }
}

/** Finalize a file uploaded chunk-by-chunk. The body carries no file bytes. */
async function finalizeChunkedUpload(req: NextRequest, auth: V1Auth): Promise<Response> {
  const body = await readJson(req, finalizeSchema);
  const parentId = body.parentId ?? "";
  await assertParentUsable(auth.webhook.id, parentId);
  await assertFileQuota(auth.webhook.id);

  const owner = { apiKeyId: auth.apiKey.id, webhookId: auth.webhook.id };
  let chunks;
  let sessionId: string | null = null;

  if (body.uploadId) {
    const session = await prisma.uploadSession.findUnique({ where: { id: body.uploadId }, include: { chunks: true } });
    assertSessionUsable(session, owner);
    assertContiguous(session.chunks.map((c) => c.index), session.expectedChunks);
    chunks = toChunkRefs(session.chunks);
    sessionId = session.id;
  } else {
    console.warn("[api-v1] legacy chunk finalize (client-supplied chunks[]) — key", auth.apiKey.id);
    chunks = await resolveLegacyChunks(DiscordClient.fromUrl(decryptUrl(auth.webhook.encryptedUrl)), body.chunks!);
  }

  const total = chunks.reduce((sum, c) => sum + c.size, 0);
  assertSizeMatches(total, body.size);
  const mimeType = await sniffMime(chunks[0], body.mimeType);

  const row = await prisma.$transaction(async (tx) => {
    if (sessionId) {
      // Atomic open → completed: two racing finalizes can't both create the file.
      const { count } = await tx.uploadSession.updateMany({ where: { id: sessionId, status: "open" }, data: { status: "completed" } });
      if (count !== 1) throw new UploadError(409, "Cette session d'upload est déjà terminée.");
      await tx.uploadChunk.deleteMany({ where: { sessionId } });
    }
    return tx.driveFile.create({
      data: {
        id: nanoid(12),
        webhookId: auth.webhook.id,
        driveId: auth.webhook.driveId,
        parentId,
        filename: body.filename,
        size: BigInt(total),
        mimeType,
        chunkSize: body.chunkSize ?? DEFAULT_CHUNK_SIZE,
        chunks,
        tags: [],
      },
    });
  });
  return json(toFileEntry(row), { status: 201 });
}
