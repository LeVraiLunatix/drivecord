/**
 * /api/account — current user's account.
 *
 * GET    → { name, email, image, hasPassword, providers[], webhookCount, createdAt }
 * PATCH  → update { name }
 * DELETE → delete the account (cascades to webhooks, files, folders, sessions)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/admin";
import { TIER_LABEL, type PatreonTier } from "@/lib/patreon";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      name: true,
      email: true,
      image: true,
      password: true,
      createdAt: true,
      patreonTier: true,
      accounts: { select: { provider: true } },
      _count: { select: { webhooks: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  const patreonTier = (user.patreonTier ?? 0) as PatreonTier;

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    hasPassword: Boolean(user.password),
    providers: user.accounts.map((a) => a.provider),
    webhookCount: user._count.webhooks,
    createdAt: user.createdAt.getTime(),
    isAdmin: isAdminEmail(user.email),
    patreonTier,
    patreonTierLabel: TIER_LABEL[patreonTier],
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await req.json()) as { name?: string };
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    data.name = name.length > 0 ? name.slice(0, 60) : null;
  }

  const user = await prisma.user.update({
    where: { id: session.user.id },
    data,
    select: { name: true, email: true, image: true },
  });
  return NextResponse.json(user);
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // Cascade: accounts, sessions, webhooks → DriveFile / DriveFolder.
  await prisma.user.delete({ where: { id: session.user.id } });
  return new NextResponse(null, { status: 204 });
}
