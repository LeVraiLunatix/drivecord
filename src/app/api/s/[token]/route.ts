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

  const expired = share.expiresAt ? share.expiresAt.getTime() < Date.now() : false;
  const file = await prisma.driveFile.findFirst({
    where: { id: share.fileId, trashed: false },
    select: { filename: true, size: true, mimeType: true },
  });

  return NextResponse.json({
    exists: Boolean(file),
    expired,
    hasPassword: Boolean(share.passwordHash),
    filename: file?.filename ?? null,
    size: file?.size ?? null,
    mimeType: file?.mimeType ?? null,
  });
}
