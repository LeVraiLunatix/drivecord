/**
 * /api/account — current user's account.
 *
 * GET    → { name, email, image, hasPassword, providers[], webhookCount, createdAt,
 *            cord: { name, email } | null, canUnlinkCord }
 * PATCH  → update { name }
 * DELETE → delete the account (cascades to webhooks, files, folders, sessions)
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isAdminEmail } from "@/lib/auth/admin";
import { TIER_LABEL, type PatreonTier } from "@/lib/patreon";
import { deleteStorageChannel } from "@/lib/discord/storage-guild";
import { canUnlinkCord, cordIdentityFromIdToken } from "@/lib/auth/cord-shared";
import { afterCordClear } from "@/lib/cord-sync";

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
      hideFromSupporters: true,
      accounts: { select: { provider: true, id_token: true } },
      _count: { select: { webhooks: true, authenticators: true } },
    },
  });

  if (!user) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  const patreonTier = (user.patreonTier ?? 0) as PatreonTier;
  const providers = user.accounts.map((a) => a.provider);
  const cordAccount = user.accounts.find((a) => a.provider === "cord");

  return NextResponse.json({
    name: user.name,
    email: user.email,
    image: user.image,
    hasPassword: Boolean(user.password),
    providers,
    cord: cordAccount
      ? (cordIdentityFromIdToken(cordAccount.id_token) ?? { name: null, email: null })
      : null,
    canUnlinkCord: canUnlinkCord({
      hasPassword: Boolean(user.password),
      passkeyCount: user._count.authenticators,
      providers: providers.filter((p) => p !== "cord"),
    }),
    webhookCount: user._count.webhooks,
    createdAt: user.createdAt.getTime(),
    isAdmin: isAdminEmail(user.email),
    patreonTier,
    patreonTierLabel: TIER_LABEL[patreonTier],
    hideFromSupporters: user.hideFromSupporters,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await req.json()) as {
    name?: string;
    hideFromSupporters?: boolean;
  };
  const data: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    data.name = name.length > 0 ? name.slice(0, 60) : null;
  }
  if (typeof body.hideFromSupporters === "boolean") {
    data.hideFromSupporters = body.hideFromSupporters;
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

  // Salons auto-provisionnés (sur le guild de stockage) : à nettoyer côté
  // Discord aussi. Capturé avant la suppression pour avoir les channelId.
  const storageGuildId = process.env.DISCORD_STORAGE_GUILD_ID;
  const toCleanup = storageGuildId
    ? await prisma.webhook.findMany({
        where: { userId: session.user.id, guildId: storageGuildId },
        select: { channelId: true },
      })
    : [];

  // Compte Cord: its Account row goes with the cascade, keep the sub to clear the hub tile.
  const cord = await prisma.account.findFirst({
    where: { userId: session.user.id, provider: "cord" },
    select: { providerAccountId: true },
  });

  // Cascade: accounts, sessions, webhooks → DriveFile / DriveFolder.
  await prisma.user.delete({ where: { id: session.user.id } });

  await Promise.all(toCleanup.map((w) => deleteStorageChannel(w.channelId)));
  afterCordClear(cord?.providerAccountId);

  return new NextResponse(null, { status: 204 });
}
