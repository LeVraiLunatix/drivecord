/**
 * GET /api/v1/public/[token] — serve a file's raw bytes with no authentication.
 *
 * This is the target of the links created by `POST /api/v1/files/[id]/public`:
 * a stable URL meant to be hotlinked directly (`<img src>`, `<a href>`,
 * `fetch()` from a browser) without ever sending an API key. Anyone with the
 * token can fetch it, same trust model as any other public share link.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchAndDecryptFile } from "@/lib/serve-file";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import type { ChunkRef } from "@/lib/discord";

export const runtime = "nodejs";

const CORS_HEADERS = { "Access-Control-Allow-Origin": "*" };

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "GET, OPTIONS" },
  });
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;

  const ip = getClientIp(req);
  const limited = await rateLimit(`public-file:ip:${ip}`, 300, 60);
  if (!limited.ok) {
    return NextResponse.json(
      { error: "Trop de requêtes." },
      { status: 429, headers: { ...CORS_HEADERS, "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const share = await prisma.share.findUnique({ where: { token }, include: { webhook: true } });
  if (!share) {
    return NextResponse.json({ error: "Lien introuvable." }, { status: 404, headers: CORS_HEADERS });
  }
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Ce lien a expiré." }, { status: 410, headers: CORS_HEADERS });
  }
  if (share.passwordHash) {
    // A password-protected link can't be served without a prompt — not
    // hotlink-safe. Use the web share page (`/s/[token]`) for those instead.
    return NextResponse.json(
      { error: "Ce lien est protégé par mot de passe." },
      { status: 403, headers: CORS_HEADERS },
    );
  }

  const file = await prisma.driveFile.findFirst({
    where: { id: share.fileId, trashed: false },
  });
  if (!file) {
    return NextResponse.json({ error: "Fichier supprimé." }, { status: 404, headers: CORS_HEADERS });
  }

  const result = await fetchAndDecryptFile({
    encryptedWebhookUrl: share.webhook.encryptedUrl,
    encKeyEncrypted: share.webhook.encKey,
    chunks: file.chunks as unknown as ChunkRef[],
    encIv: file.encIv,
    locked: file.locked,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status, headers: CORS_HEADERS });
  }

  prisma.share.update({ where: { token }, data: { downloads: { increment: 1 } } }).catch(() => {});

  return new NextResponse(new Uint8Array(result.body), {
    headers: {
      ...CORS_HEADERS,
      "Content-Type": file.mimeType || "application/octet-stream",
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Content-Length": String(result.body.length),
      "Cache-Control": "public, max-age=3600",
    },
  });
}
