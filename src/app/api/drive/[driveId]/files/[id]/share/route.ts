/**
 * Manage the public share link for a file.
 *
 * GET    → existing share { token, hasPassword, expiresAt } | null
 * POST   → create/replace { password?, expiresInDays? } → { token }
 * DELETE → revoke the share
 */
import { NextRequest, NextResponse } from "next/server";
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { getAuthorizedWebhook } from "../../../../_helpers";

type RouteParams = { params: Promise<{ driveId: string; id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const share = await prisma.share.findFirst({
    where: { fileId: id, webhookId: result.webhook.id },
  });
  if (!share) return NextResponse.json({ share: null });
  return NextResponse.json({
    share: {
      token: share.token,
      hasPassword: Boolean(share.passwordHash),
      expiresAt: share.expiresAt?.getTime() ?? null,
    },
  });
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  const file = await prisma.driveFile.findFirst({
    where: { id, webhookId: result.webhook.id, trashed: false },
    select: { id: true, locked: true },
  });
  if (!file) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  if (file.locked) {
    return NextResponse.json(
      { error: "Les fichiers du coffre-fort ne peuvent pas être partagés." },
      { status: 400 },
    );
  }

  const { password, expiresInDays } = (await req.json()) as {
    password?: string;
    expiresInDays?: number | null;
  };

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const expiresAt =
    expiresInDays && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : null;

  // Replace any existing share for this file.
  await prisma.share.deleteMany({ where: { fileId: id, webhookId: result.webhook.id } });
  const token = nanoid(10);
  await prisma.share.create({
    data: { token, webhookId: result.webhook.id, fileId: id, passwordHash, expiresAt },
  });

  return NextResponse.json({ token, hasPassword: Boolean(passwordHash), expiresAt: expiresAt?.getTime() ?? null });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  await prisma.share.deleteMany({ where: { fileId: id, webhookId: result.webhook.id } });
  return new NextResponse(null, { status: 204 });
}
