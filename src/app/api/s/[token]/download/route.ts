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
import { isDiscordCdnUrl, isSnowflake } from "@/lib/discord";
import type { ChunkRef } from "@/lib/discord";
import { auth } from "@/auth";
import { afterCordNotify, DRIVECORD_URL } from "@/lib/cord-sync";

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
  if (share.disabledAt) return NextResponse.json({ error: "Ce lien a été désactivé." }, { status: 410 });
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

  // A legacy single-IV encrypted file can't be served: the server holds no key for it.
  if (file.cryptoVersion === 0 && file.encIv) {
    return NextResponse.json(
      { error: "Ce lien doit être régénéré par son propriétaire (le chiffrement a été renforcé).", needsRegenerate: true },
      { status: 409 },
    );
  }

  const webhookUrl = decryptUrl(share.webhook.encryptedUrl);
  const chunks = file.chunks as unknown as ChunkRef[];

  // Refresh each chunk's CDN URL (signed Discord URLs expire). One message
  // fetch per chunk; messages are cached by id to avoid duplicate calls.
  if (chunks.some((c) => !isSnowflake(c.messageId) || !isSnowflake(c.attachmentId))) {
    return NextResponse.json({ error: "Référence de fichier invalide." }, { status: 502 });
  }
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
        if (att && isDiscordCdnUrl(att.url)) return { ...c, url: att.url };
      } catch {
        /* fall back to stored URL */
      }
      return c;
    }),
  );

  // Whatever we end up handing out or fetching must be a Discord CDN URL.
  if (fresh.some((c) => !isDiscordCdnUrl(c.url))) {
    return NextResponse.json({ error: "Référence de fichier invalide." }, { status: 502 });
  }

  const countDownload = async () => {
    const counted = await prisma.share
      .update({ where: { token }, data: { downloads: { increment: 1 } }, select: { downloads: true } })
      .catch(() => null);
    // First open of the link: tell the owner on the Cord hub (not when they open it themselves).
    if (counted?.downloads === 1) {
      const viewer = await auth().catch(() => null);
      if (viewer?.user?.id !== share.webhook.userId) {
        afterCordNotify(
          share.webhook.userId,
          {
            title: "Ton lien de partage a été ouvert",
            body: file.filename
              ? `« ${file.filename} » vient d’être téléchargé pour la première fois.`
              : "Un fichier que tu as partagé vient d’être téléchargé pour la première fois.",
            url: `${DRIVECORD_URL}/shares`,
          },
          { kind: { key: "share", limit: 10, windowSec: 3600 } },
        );
      }
    }
  };

  // End-to-end encrypted file: hand out the CIPHERTEXT manifest only. The browser decrypts with
  // the key from the URL fragment (or the password-derived one); the server never can.
  if (file.cryptoVersion >= 1) {
    await countDownload();
    return NextResponse.json({
      encrypted: true,
      fileId: file.id,
      cryptoVersion: file.cryptoVersion,
      noncePrefix: file.noncePrefix,
      encMeta: file.encMeta,
      size: file.size,
      chunks: fresh,
    });
  }

  // Plaintext file → return a manifest the visitor's browser fetches via /api/proxy.
  await countDownload();
  return NextResponse.json({
    filename: file.filename,
    size: file.size,
    mimeType: file.mimeType,
    chunkSize: file.chunkSize,
    chunks: fresh,
  });
}
