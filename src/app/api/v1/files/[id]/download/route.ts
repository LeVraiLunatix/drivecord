/**
 * GET /api/v1/files/[id]/download — stream the file's bytes directly.
 *
 * Refreshes each chunk's Discord CDN URL server-side (signed URLs expire
 * after ~24h) before fetching, same approach as the public share endpoint.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { decryptFileBuffer } from "@/lib/crypto/file-server-crypto";
import type { ChunkRef } from "@/lib/discord";
import { authenticateApiKey, checkRateLimit, corsJson, hasScope, preflight } from "../../../_helpers";

export const runtime = "nodejs";

type RouteParams = { params: Promise<{ id: string }> };
type DiscordAttachment = { id: string; url: string };
type DiscordMessage = { attachments: DiscordAttachment[] };

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
  const file = await prisma.driveFile.findFirst({
    where: { id, webhookId: auth.webhook.id, trashed: false },
  });
  if (!file) return corsJson({ error: "Fichier introuvable." }, { status: 404 });
  if (file.locked) {
    return corsJson(
      { error: "Ce fichier est dans le coffre-fort chiffré et ne peut pas être servi par l'API." },
      { status: 403 },
    );
  }

  const webhookUrl = decryptUrl(auth.webhook.encryptedUrl);
  const chunks = [...(file.chunks as unknown as ChunkRef[])].sort((a, b) => a.index - b.index);

  const cache = new Map<string, DiscordMessage | null>();
  const parts: Buffer[] = [];
  for (const c of chunks) {
    let url = c.url;
    try {
      let msg = cache.get(c.messageId);
      if (msg === undefined) {
        const res = await fetch(`${webhookUrl}/messages/${c.messageId}`);
        msg = res.ok ? ((await res.json()) as DiscordMessage) : null;
        cache.set(c.messageId, msg);
      }
      const att = msg?.attachments.find((a) => a.id === c.attachmentId);
      if (att) url = att.url;
    } catch {
      // fall back to the stored URL
    }
    const r = await fetch(url);
    if (!r.ok) {
      return corsJson({ error: "Téléchargement interrompu." }, { status: 502 });
    }
    parts.push(Buffer.from(await r.arrayBuffer()));
  }

  let body: Buffer = Buffer.concat(parts);
  if (file.encIv) {
    if (!auth.webhook.encKey) {
      return corsJson({ error: "Ce fichier chiffré ne peut pas être servi (clé de drive absente)." }, { status: 403 });
    }
    const keyB64 = decryptUrl(auth.webhook.encKey);
    body = decryptFileBuffer(body, keyB64, file.encIv);
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Length": String(body.length),
    },
  });
}
