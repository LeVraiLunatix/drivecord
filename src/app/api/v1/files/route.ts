/**
 * GET  /api/v1/files  — list files in the drive (optionally by folder)
 * POST /api/v1/files  — create a file, two ways:
 *   1. multipart/form-data (`file`, optional `parentId`/`filename`) — simple
 *      one-shot upload, bound by the platform's request body size limit.
 *   2. application/json ({ filename, size?, mimeType?, chunkSize?, parentId?,
 *      chunks }) — finalize a file whose chunks were uploaded one by one via
 *      `POST /api/v1/files/chunks`. Use this path for files of unlimited size.
 *
 * Auth: `Authorization: Bearer dvc_...`. Files uploaded here are stored as
 * plaintext (no client-side E2EE key exists for a server-to-server caller) —
 * unlike files uploaded from the Drivecord web app.
 */
import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { decryptUrl } from "@/lib/auth/encrypt";
import { toFileEntry } from "@/app/api/drive/_helpers";
import { DiscordClient, DiscordApiError, DEFAULT_CHUNK_SIZE } from "@/lib/discord";
import type { ChunkRef } from "@/lib/discord";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight, type ApiAuth } from "../_helpers";

export const runtime = "nodejs";

/** Requests to `/api/v1/files` go through our server (unlike the web app's
 *  direct browser-to-Discord uploads), so they're bound by the hosting
 *  platform's request body limit. Keep a conservative ceiling. */
const MAX_UPLOAD_BYTES = 45 * 1024 * 1024; // 45 MiB

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "read")) {
    return corsJson({ error: "Cette clé n'a pas la permission de lecture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const { searchParams } = new URL(req.url);
  const recursive = searchParams.get("recursive") === "1";
  const updatedSinceRaw = searchParams.get("updatedSince");
  const cursor = searchParams.get("cursor");

  // ── Sync mode ──────────────────────────────────────────────────────────────
  // Triggered by `recursive`, `updatedSince` or `cursor`. Walks the whole drive
  // (or one folder), ordered by `updatedAt` so a client can page through with
  // `cursor` and, on later polls, ask only for what changed via `updatedSince`.
  // There are no deletion tombstones: a client detects removals by diffing a
  // full `recursive=1` listing against its local state.
  if (recursive || updatedSinceRaw !== null || cursor !== null) {
    const limit = Math.min(500, Math.max(1, Number(searchParams.get("limit")) || 200));

    const and: Prisma.DriveFileWhereInput[] = [];

    if (updatedSinceRaw !== null) {
      const since = Number(updatedSinceRaw);
      if (!Number.isFinite(since) || since < 0) {
        return corsJson({ error: "Paramètre `updatedSince` invalide." }, { status: 400 });
      }
      and.push({ updatedAt: { gt: new Date(since) } });
    }

    if (cursor !== null) {
      // Format: "<updatedAtMs>_<id>". Split on the FIRST underscore only —
      // nanoid ids can themselves contain "_".
      const sep = cursor.indexOf("_");
      const at = Number(cursor.slice(0, sep));
      const id = cursor.slice(sep + 1);
      if (sep < 1 || !Number.isFinite(at) || !id) {
        return corsJson({ error: "Paramètre `cursor` invalide." }, { status: 400 });
      }
      // Keyset pagination over the (updatedAt, id) order.
      and.push({
        OR: [
          { updatedAt: { gt: new Date(at) } },
          { AND: [{ updatedAt: new Date(at) }, { id: { gt: id } }] },
        ],
      });
    }

    const rows = await prisma.driveFile.findMany({
      where: {
        webhookId: auth.webhook.id,
        trashed: false,
        ...(recursive ? {} : { parentId: searchParams.get("parentId") ?? "" }),
        ...(and.length > 0 ? { AND: and } : {}),
      },
      orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
      take: limit,
    });

    const last = rows[rows.length - 1];
    const nextCursor =
      rows.length === limit && last ? `${last.updatedAt.getTime()}_${last.id}` : null;

    return corsJson({ files: rows.map(toFileEntry), nextCursor });
  }

  // ── Legacy mode ────────────────────────────────────────────────────────────
  const parentId = searchParams.get("parentId") ?? "";
  const limit = Math.min(200, Math.max(1, Number(searchParams.get("limit")) || 100));

  const rows = await prisma.driveFile.findMany({
    where: { webhookId: auth.webhook.id, parentId, trashed: false },
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return corsJson({ files: rows.map(toFileEntry) });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "write")) {
    return corsJson({ error: "Cette clé n'a pas la permission d'écriture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  if ((req.headers.get("content-type") ?? "").includes("application/json")) {
    return finalizeChunkedUpload(req, auth);
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return corsJson({ error: "Corps de requête invalide (attendu: multipart/form-data)." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return corsJson({ error: "Champ `file` manquant." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return corsJson(
      { error: `Fichier trop volumineux (max ${MAX_UPLOAD_BYTES / (1024 * 1024)} Mio).` },
      { status: 413 },
    );
  }
  const parentId = String(form.get("parentId") ?? "");
  const filename = String(form.get("filename") ?? file.name ?? "fichier");

  const webhookUrl = decryptUrl(auth.webhook.encryptedUrl);
  const client = DiscordClient.fromUrl(webhookUrl);

  try {
    const manifest = await client.uploadFile(file, {
      filename,
      chunkSize: DEFAULT_CHUNK_SIZE,
    });

    const row = await prisma.driveFile.create({
      data: {
        id: nanoid(12),
        webhookId: auth.webhook.id,
        driveId: auth.webhook.driveId,
        parentId,
        filename: manifest.filename,
        size: manifest.size,
        mimeType: manifest.mimeType,
        chunkSize: manifest.chunkSize,
        chunks: manifest.chunks,
        tags: [],
      },
    });

    return corsJson(toFileEntry(row), { status: 201 });
  } catch (err) {
    if (err instanceof DiscordApiError) {
      return corsJson({ error: `Échec de l'upload vers Discord : ${err.message}` }, { status: 502 });
    }
    throw err;
  }
}

/**
 * Finalize a file uploaded chunk-by-chunk via `POST /api/v1/files/chunks`.
 * The body only carries chunk *references* (message/attachment ids), never
 * file bytes, so there's no size limit to enforce here.
 */
async function finalizeChunkedUpload(req: NextRequest, auth: ApiAuth) {
  const body = (await req.json().catch(() => null)) as {
    filename?: string;
    mimeType?: string;
    chunkSize?: number;
    parentId?: string;
    chunks?: ChunkRef[];
  } | null;

  if (!body?.filename || !Array.isArray(body.chunks) || body.chunks.length === 0) {
    return corsJson(
      { error: "Corps invalide : `filename` et `chunks` (liste non vide) requis." },
      { status: 400 },
    );
  }
  const chunks = [...body.chunks].sort((a, b) => a.index - b.index);
  const invalid = chunks.some(
    (c) =>
      typeof c.index !== "number" ||
      typeof c.size !== "number" ||
      typeof c.messageId !== "string" ||
      typeof c.attachmentId !== "string" ||
      typeof c.url !== "string",
  );
  if (invalid) {
    return corsJson({ error: "Un ou plusieurs chunks sont mal formés." }, { status: 400 });
  }

  const row = await prisma.driveFile.create({
    data: {
      id: nanoid(12),
      webhookId: auth.webhook.id,
      driveId: auth.webhook.driveId,
      parentId: body.parentId ?? "",
      filename: body.filename,
      size: chunks.reduce((sum, c) => sum + c.size, 0),
      mimeType: body.mimeType ?? "",
      chunkSize: body.chunkSize ?? DEFAULT_CHUNK_SIZE,
      chunks,
      tags: [],
    },
  });

  return corsJson(toFileEntry(row), { status: 201 });
}
