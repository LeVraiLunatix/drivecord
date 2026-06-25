/**
 * POST /api/s/[token]/download — validate access, refresh the file's Discord
 * CDN URLs server-side (using the owner's webhook) and return a fresh manifest
 * the visitor's browser can download via /api/proxy.
 *
 * Body: { password? }
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { decryptFileBuffer } from "@/lib/crypto/file-server-crypto";
import type { ChunkRef } from "@/lib/discord";

export const runtime = "nodejs";

type DiscordAttachment = { id: string; url: string };
type DiscordMessage = { attachments: DiscordAttachment[] };

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };

  const share = await prisma.share.findUnique({
    where: { token },
    include: { webhook: true },
  });
  if (!share) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Ce lien a expiré." }, { status: 410 });
  }
  if (share.passwordHash) {
    if (!password || !(await bcrypt.compare(password, share.passwordHash))) {
      return NextResponse.json({ error: "Mot de passe incorrect." }, { status: 403 });
    }
  }

  const file = await prisma.driveFile.findFirst({
    where: { id: share.fileId, trashed: false },
  });
  if (!file) return NextResponse.json({ error: "Fichier supprimé." }, { status: 404 });

  const webhookUrl = decryptUrl(share.webhook.encryptedUrl);
  const chunks = file.chunks as unknown as ChunkRef[];

  // Refresh each chunk's CDN URL (signed Discord URLs expire). One message
  // fetch per chunk; messages are cached by id to avoid duplicate calls.
  const cache = new Map<string, DiscordMessage | null>();
  const fresh = await Promise.all(
    chunks.map(async (c) => {
      try {
        let msg = cache.get(c.messageId);
        if (msg === undefined) {
          const res = await fetch(`${webhookUrl}/messages/${c.messageId}`);
          msg = res.ok ? ((await res.json()) as DiscordMessage) : null;
          cache.set(c.messageId, msg);
        }
        const att = msg?.attachments.find((a) => a.id === c.attachmentId);
        if (att) return { ...c, url: att.url };
      } catch {
        /* fall back to stored URL */
      }
      return c;
    }),
  );

  await prisma.share.update({
    where: { token },
    data: { downloads: { increment: 1 } },
  }).catch(() => {});

  // Encrypted file → decrypt server-side and serve the plaintext bytes directly.
  // (Vault-locked files can't be served: the server doesn't hold the PIN key.)
  if (file.encIv) {
    if (file.locked || !share.webhook.encKey) {
      return NextResponse.json(
        { error: "Ce fichier chiffré ne peut pas être partagé." },
        { status: 403 },
      );
    }
    const ordered = [...fresh].sort((a, b) => a.index - b.index);
    const parts: Buffer[] = [];
    for (const c of ordered) {
      const r = await fetch(c.url);
      if (!r.ok) {
        return NextResponse.json(
          { error: "Téléchargement interrompu." },
          { status: 502 },
        );
      }
      parts.push(Buffer.from(await r.arrayBuffer()));
    }
    const keyB64 = decryptUrl(share.webhook.encKey);
    const plain = decryptFileBuffer(Buffer.concat(parts), keyB64, file.encIv);
    return new NextResponse(new Uint8Array(plain), {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
        "Content-Length": String(plain.length),
      },
    });
  }

  // Plaintext file → return a manifest the visitor's browser fetches via /api/proxy.
  return NextResponse.json({
    filename: file.filename,
    size: file.size,
    mimeType: file.mimeType,
    chunkSize: file.chunkSize,
    chunks: fresh,
  });
}
