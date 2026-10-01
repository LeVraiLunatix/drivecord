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
import { phraseKdfSchema, wrappedBlob } from "@/lib/e2ee-server";

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
      hasPassword: Boolean(share.passwordHash || share.fkWrappedForShare),
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
    select: { id: true, locked: true, cryptoVersion: true, encIv: true },
  });
  if (!file) return NextResponse.json({ error: "Fichier introuvable." }, { status: 404 });
  if (file.locked) {
    return NextResponse.json(
      { error: "Les fichiers du coffre-fort ne peuvent pas être partagés." },
      { status: 400 },
    );
  }

  const { password, expiresInDays, fkWrappedForShare, shareKdf, token: clientToken } = (await req.json()) as {
    /** E2EE shares: chosen by the client so it can be bound into the password-wrapping AAD. */
    token?: string;
    password?: string;
    expiresInDays?: number | null;
    /** E2EE password share: FK wrapped by Argon2id(password) — the server never sees the password. */
    fkWrappedForShare?: string;
    shareKdf?: unknown;
  };

  const e2ee = file.cryptoVersion >= 1;
  if (!e2ee && file.encIv) {
    // A legacy single-IV file's "key" is the whole drive key: sharing it would hand that over.
    return NextResponse.json(
      { error: "Ce fichier est à l'ancien format de chiffrement : rechiffre-le d'abord pour le partager." },
      { status: 409 },
    );
  }
  if (e2ee && password) {
    return NextResponse.json({ error: "Pour un fichier chiffré, le mot de passe est appliqué côté client." }, { status: 400 });
  }
  if (fkWrappedForShare !== undefined || shareKdf !== undefined) {
    if (!e2ee || !wrappedBlob.safeParse(fkWrappedForShare).success || !phraseKdfSchema.safeParse(shareKdf).success) {
      return NextResponse.json({ error: "Protection par mot de passe invalide." }, { status: 400 });
    }
  }

  const passwordHash = password ? await bcrypt.hash(password, 10) : null;
  const expiresAt =
    expiresInDays && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : null;

  // Replace any existing share for this file.
  await prisma.share.deleteMany({ where: { fileId: id, webhookId: result.webhook.id } });
  const token = e2ee && typeof clientToken === "string" && /^[A-Za-z0-9_-]{24}$/.test(clientToken) ? clientToken : nanoid(16);
  await prisma.share.create({
    data: {
      token, webhookId: result.webhook.id, fileId: id, passwordHash, expiresAt,
      ...(fkWrappedForShare ? { fkWrappedForShare, shareKdf: shareKdf as object } : {}),
    },
  });

  return NextResponse.json({
    token,
    hasPassword: Boolean(passwordHash || fkWrappedForShare),
    expiresAt: expiresAt?.getTime() ?? null,
  });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams) {
  const { driveId, id } = await params;
  const result = await getAuthorizedWebhook(driveId);
  if (!result) return NextResponse.json({ error: "Non autorisé." }, { status: 401 });

  await prisma.share.deleteMany({ where: { fileId: id, webhookId: result.webhook.id } });
  return new NextResponse(null, { status: 204 });
}
