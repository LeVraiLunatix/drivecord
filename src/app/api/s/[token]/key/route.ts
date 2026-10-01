/**
 * POST /api/s/[token]/key — fetch the password-wrapped file key of an E2EE share:
 * `{ fkWrappedForShare, shareKdf }`. The server cannot verify the password (it never
 * sees it); the visitor's browser proves it by successfully unwrapping. This endpoint
 * only rate-limits how often the blob can be fetched, per IP and per share.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ip = getClientIp(req);
  const perIp = await rateLimit(`share-key:ip:${ip}:${token}`, 10, 600);
  const perShare = await rateLimit(`share-key:share:${token}`, 60, 3600);
  const limited = !perIp.ok ? perIp : !perShare.ok ? perShare : null;
  if (limited) {
    return NextResponse.json(
      { error: "Trop d'essais. Réessaie plus tard." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfterSec) } },
    );
  }

  const share = await prisma.share.findUnique({ where: { token } });
  if (!share || share.disabledAt || !share.fkWrappedForShare) {
    return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });
  }
  if (share.expiresAt && share.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Ce lien a expiré." }, { status: 410 });
  }
  return NextResponse.json({ fkWrappedForShare: share.fkWrappedForShare, shareKdf: share.shareKdf });
}
