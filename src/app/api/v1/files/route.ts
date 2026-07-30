/**
 * GET  /api/v1/files            — list files in the drive (optionally by folder)
 * POST /api/v1/files             — upload a file (multipart/form-data: `file`, optional `parentId`)
 *
 * Auth: `Authorization: Bearer dvc_...`. Files uploaded here are stored as
 * plaintext (no client-side E2EE key exists for a server-to-server caller) —
 * unlike files uploaded from the Drivecord web app.
 */
import { NextRequest } from "next/server";
import { nanoid } from "nanoid";
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { toFileEntry } from "@/app/api/drive/_helpers";
import { DiscordClient, DiscordApiError, DEFAULT_CHUNK_SIZE } from "@/lib/discord";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight } from "../_helpers";

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
