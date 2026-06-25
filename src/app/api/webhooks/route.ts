/**
 * /api/webhooks — list and add the current user's webhooks.
 *
 * GET  → [{driveId, name, channelId, guildId, createdAt, lastOpenedAt}]
 * POST → {driveId, webhookUrl, name, channelId, guildId}  →  upserts row
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { encryptUrl, decryptUrl } from "@/lib/auth/encrypt";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const rows = await prisma.webhook.findMany({
    where: { userId: session.user.id },
    orderBy: { lastOpenedAt: "desc" },
  });

  return NextResponse.json(
    rows.map((r: typeof rows[number]) => ({
      driveId: r.driveId,
      webhookUrl: decryptUrl(r.encryptedUrl),
      name: r.name,
      channelId: r.channelId,
      guildId: r.guildId,
      encKey: r.encKey ? decryptUrl(r.encKey) : null,
      createdAt: r.createdAt.getTime(),
      lastOpenedAt: r.lastOpenedAt.getTime(),
    })),
  );
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await req.json()) as {
    driveId: string;
    webhookUrl: string;
    name: string;
    channelId: string;
    guildId?: string;
    /** base64 raw per-drive file key — encrypted here before storage. */
    encKey?: string;
  };

  if (!body.driveId || !body.webhookUrl || !body.name || !body.channelId) {
    return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  }

  const encryptedUrl = encryptUrl(body.webhookUrl);
  const encKey = body.encKey ? encryptUrl(body.encKey) : undefined;
  const row = await prisma.webhook.upsert({
    where: { userId_driveId: { userId: session.user.id, driveId: body.driveId } },
    create: {
      userId: session.user.id,
      driveId: body.driveId,
      encryptedUrl,
      encKey,
      name: body.name,
      channelId: body.channelId,
      guildId: body.guildId,
    },
    update: {
      encryptedUrl,
      // Only overwrite the key if the client actually sent one — never wipe it.
      ...(encKey ? { encKey } : {}),
      name: body.name,
      channelId: body.channelId,
      guildId: body.guildId,
      lastOpenedAt: new Date(),
    },
  });

  return NextResponse.json({ driveId: row.driveId }, { status: 201 });
}
