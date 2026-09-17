/**
 * GET    /api/v1/files/[id] — file metadata
 * DELETE /api/v1/files/[id] — delete the file (Discord messages + DB row)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { toFileEntry } from "@/app/api/drive/_helpers";
import { DiscordClient } from "@/lib/discord";
import type { ChunkRef, FileManifest } from "@/lib/discord";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight } from "../../_helpers";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "read")) {
    return corsJson({ error: "Cette clé n'a pas la permission de lecture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const { id } = await params;
  const row = await prisma.driveFile.findFirst({
    where: { id, webhookId: auth.webhook.id },
  });
  if (!row) return corsJson({ error: "Fichier introuvable." }, { status: 404 });
  return corsJson(toFileEntry(row));
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  const auth = await authenticateApiKey(req);
  if (!auth) return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  if (!hasScope(auth.apiKey, "write")) {
    return corsJson({ error: "Cette clé n'a pas la permission d'écriture." }, { status: 403 });
  }
  const limited = await checkRateLimit(auth.apiKey);
  if (limited) return limited;

  const { id } = await params;
  const row = await prisma.driveFile.findFirst({
    where: { id, webhookId: auth.webhook.id },
  });
  if (!row) return corsJson({ error: "Fichier introuvable." }, { status: 404 });

  const webhookUrl = decryptUrl(auth.webhook.encryptedUrl);
  const client = DiscordClient.fromUrl(webhookUrl);
  const manifest: FileManifest = {
    size: row.size,
    mimeType: row.mimeType,
    filename: row.filename,
    chunkSize: row.chunkSize,
    chunks: row.chunks as unknown as ChunkRef[],
  };
  try {
    await client.deleteFile(manifest);
  } catch {
    // A real cleanup failure (not "already gone") must not drop metadata
    // for messages that are still live on Discord — that would orphan them.
    return corsJson(
      { error: "Échec de nettoyage Discord — rien n'a été supprimé, réessaie." },
      { status: 502 },
    );
  }

  await prisma.driveFile.deleteMany({ where: { id, webhookId: auth.webhook.id } });
  return new NextResponse(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*" } });
}
