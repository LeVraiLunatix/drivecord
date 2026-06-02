/**
 * GET /api/account/shares — all share links owned by the current user,
 * across every drive, with file info + stats.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const webhooks = await prisma.webhook.findMany({
    where: { userId: session.user.id },
    select: { id: true, driveId: true, name: true },
  });
  const webhookById = new Map(webhooks.map((w) => [w.id, w]));
  if (webhooks.length === 0) return NextResponse.json({ shares: [] });

  const shares = await prisma.share.findMany({
    where: { webhookId: { in: webhooks.map((w) => w.id) } },
    orderBy: { createdAt: "desc" },
  });

  // Attach file info (filename/size) for each share.
  const fileIds = shares.map((s) => s.fileId);
  const files = await prisma.driveFile.findMany({
    where: { id: { in: fileIds } },
    select: { id: true, filename: true, size: true, trashed: true },
  });
  const fileById = new Map(files.map((f) => [f.id, f]));

  const now = Date.now();
  const result = shares.map((s) => {
    const f = fileById.get(s.fileId);
    const wh = webhookById.get(s.webhookId);
    return {
      token: s.token,
      driveId: wh?.driveId ?? null,
      fileId: s.fileId,
      driveName: wh?.name ?? null,
      filename: f?.filename ?? "(fichier supprimé)",
      size: f?.size ?? 0,
      missing: !f || f.trashed,
      hasPassword: Boolean(s.passwordHash),
      expiresAt: s.expiresAt?.getTime() ?? null,
      expired: s.expiresAt ? s.expiresAt.getTime() < now : false,
      downloads: s.downloads,
      createdAt: s.createdAt.getTime(),
    };
  });

  return NextResponse.json({ shares: result });
}
