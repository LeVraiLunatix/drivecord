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
import { afterCordStatus } from "@/lib/cord-sync";
import { wrappedBlob } from "@/lib/e2ee-server";
import { parseWebhookUrl } from "@/lib/discord";

function isValidWebhookUrl(url: unknown): url is string {
  return typeof url === "string" && url.length < 512 && parseWebhookUrl(url) !== null;
}

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
      dkWrapped: r.dkWrapped,
      e2eeVersion: r.e2eeVersion,
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
    /** E2EE: the drive key wrapped by the user's Master Key (opaque to the server). */
    dkWrapped?: string;
  };

  if (!body.driveId || !body.webhookUrl || !body.name || !body.channelId) {
    return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  }

  if (!isValidWebhookUrl(body.webhookUrl)) {
    return NextResponse.json({ error: "URL de webhook Discord invalide." }, { status: 400 });
  }
  if (body.dkWrapped !== undefined && !wrappedBlob.safeParse(body.dkWrapped).success) {
    return NextResponse.json({ error: "Clé de drive chiffrée invalide." }, { status: 400 });
  }

  // The server never holds a drive key: an old client still sending `encKey` is ignored.
  const hasE2ee = Boolean(
    await prisma.userKeys.findUnique({ where: { userId: session.user.id }, select: { userId: true } }),
  );
  const existing = await prisma.webhook.findUnique({
    where: { userId_driveId: { userId: session.user.id, driveId: body.driveId } },
    select: { e2eeVersion: true },
  });
  const encryptedUrl = encryptUrl(body.webhookUrl);
  // A drive key may be set only while the drive has none (finalize/rotate endpoints do later changes).
  const dkWrapped = body.dkWrapped && hasE2ee && !existing ? body.dkWrapped : undefined;
  const row = await prisma.webhook.upsert({
    where: { userId_driveId: { userId: session.user.id, driveId: body.driveId } },
    create: {
      userId: session.user.id,
      driveId: body.driveId,
      encryptedUrl,
      ...(dkWrapped ? { dkWrapped, e2eeVersion: 1 } : {}),
      name: body.name,
      channelId: body.channelId,
      guildId: body.guildId,
    },
    update: {
      encryptedUrl,
      name: body.name,
      channelId: body.channelId,
      guildId: body.guildId,
      lastOpenedAt: new Date(),
    },
  });

  // A brand-new drive (not a re-sync of an existing one) changes the Cord hub numbers.
  if (Date.now() - row.createdAt.getTime() < 10_000) afterCordStatus(session.user.id);

  return NextResponse.json({ driveId: row.driveId }, { status: 201 });
}
