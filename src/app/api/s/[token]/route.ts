/**
 * GET /api/s/[token] — public info about a shared file (no auth).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const share = await prisma.share.findUnique({ where: { token } });
  if (!share) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });

  if (share.disabledAt) {
    // Treated like a dead link: no file details for a disabled share.
    return NextResponse.json({ exists: false, expired: false, hasPassword: false, filename: null, size: null, mimeType: null });
  }

  const expired = share.expiresAt ? share.expiresAt.getTime() < Date.now() : false;
  const file = await prisma.driveFile.findFirst({
    where: { id: share.fileId, trashed: false },
    select: { id: true, filename: true, size: true, mimeType: true, cryptoVersion: true, encMeta: true, encIv: true },
  });

  return NextResponse.json({
    exists: Boolean(file),
    expired,
    hasPassword: Boolean(share.passwordHash || share.fkWrappedForShare),
    // E2EE share: the browser decrypts `encMeta` with the key from the URL fragment (`#k=`)
    // — or, for a password share, with the key it derives after fetching /key.
    encrypted: (file?.cryptoVersion ?? 0) >= 1,
    e2eePassword: Boolean(share.fkWrappedForShare),
    // Bound into every AAD; not secret (a random id).
    fileId: (file?.cryptoVersion ?? 0) >= 1 ? file?.id ?? null : null,
    encMeta: (file?.cryptoVersion ?? 0) >= 1 ? file?.encMeta ?? null : null,
    // Legacy encrypted share (server-held key, now destroyed): the owner must re-create the link.
    needsRegenerate: Boolean(file && file.cryptoVersion === 0 && file.encIv),
    filename: file?.filename || null,
    size: file?.size ?? null,
    mimeType: file?.cryptoVersion ? null : file?.mimeType ?? null,
  });
}
