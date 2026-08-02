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

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Expose-Headers":
    "Accept-Ranges, Content-Length, Content-Range, ETag, Last-Modified",
};

type RouteContext = { params: Promise<{ token: string }> };

function fileHeaders(file: {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  updatedAt: Date;
}) {
  return {
    ...CORS_HEADERS,
    "Accept-Ranges": "bytes",
    "Content-Type": file.mimeType || "application/octet-stream",
    "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
    "Content-Length": String(file.size),
    "Last-Modified": file.updatedAt.toUTCString(),
    ETag: `"${file.id}-${file.updatedAt.getTime()}-${file.size}"`,
    // Browsers may cache the immutable file, but the CDN must not mix a cached
    // 200 response with a later byte-range request for the same public URL.
    "Cache-Control": "public, max-age=3600",
    "CDN-Cache-Control": "no-store",
  };
}

function parseRange(value: string, size: number): { start: number; end: number } | null {
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2]) || size <= 0) return null;

  let start: number;
  let end: number;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) return null;
    if (start < 0 || start >= size || end < start) return null;
    end = Math.min(end, size - 1);
  }

  return { start, end };
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: { ...CORS_HEADERS, "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS" },
  });
}

async function servePublicFile(
  req: NextRequest,
  { params }: RouteContext,
  headOnly: boolean,
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

  const baseHeaders = fileHeaders(file);
  if (headOnly) {
    return new NextResponse(null, { status: 200, headers: baseHeaders });
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

  const totalSize = result.body.length;
  const rangeHeader = req.headers.get("range");
  if (rangeHeader) {
    const range = parseRange(rangeHeader, totalSize);
    if (!range) {
      return new NextResponse(null, {
        status: 416,
        headers: {
          ...baseHeaders,
          "Content-Length": "0",
          "Content-Range": `bytes */${totalSize}`,
        },
      });
    }

    const body = result.body.subarray(range.start, range.end + 1);
    prisma.share.update({ where: { token }, data: { downloads: { increment: 1 } } }).catch(() => {});
    return new NextResponse(new Uint8Array(body), {
      status: 206,
      headers: {
        ...baseHeaders,
        "Content-Length": String(body.length),
        "Content-Range": `bytes ${range.start}-${range.end}/${totalSize}`,
      },
    });
  }

  prisma.share.update({ where: { token }, data: { downloads: { increment: 1 } } }).catch(() => {});

  return new NextResponse(new Uint8Array(result.body), {
    headers: { ...baseHeaders, "Content-Length": String(totalSize) },
  });
}

export function GET(req: NextRequest, context: RouteContext) {
  return servePublicFile(req, context, false);
}

export function HEAD(req: NextRequest, context: RouteContext) {
  return servePublicFile(req, context, true);
}
