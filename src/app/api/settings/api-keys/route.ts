/**
 * GET  /api/settings/api-keys — list the current user's API keys (never the raw secret).
 * POST /api/settings/api-keys — create a new key for one of the user's drives.
 *                                Body: { driveId, name, scopes? }
 *                                Returns the raw key ONCE — it is never shown again.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { generateApiKey, sanitizeScopes } from "@/lib/auth/api-key";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const keys = await prisma.apiKey.findMany({
    where: { userId: session.user.id },
    include: { webhook: { select: { name: true, driveId: true } } },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    keys: keys.map((k: (typeof keys)[number]) => ({
      id: k.id,
      name: k.name,
      prefix: k.keyPrefix,
      scopes: k.scopes,
      driveId: k.webhook.driveId,
      driveName: k.webhook.name,
      lastUsedAt: k.lastUsedAt,
      createdAt: k.createdAt,
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    driveId?: string;
    name?: string;
    scopes?: string[];
  };
  const name = body.name?.trim();
  if (!body.driveId || !name) {
    return NextResponse.json({ error: "Données manquantes." }, { status: 400 });
  }

  const webhook = await prisma.webhook.findFirst({
    where: { driveId: body.driveId, userId: session.user.id },
  });
  if (!webhook) {
    return NextResponse.json({ error: "Drive introuvable." }, { status: 404 });
  }

  const { raw, prefix, hash } = generateApiKey();
  const row = await prisma.apiKey.create({
    data: {
      userId: session.user.id,
      webhookId: webhook.id,
      name,
      keyPrefix: prefix,
      keyHash: hash,
      scopes: sanitizeScopes(body.scopes),
    },
  });

  return NextResponse.json(
    {
      id: row.id,
      key: raw,
      prefix: row.keyPrefix,
      name: row.name,
      scopes: row.scopes,
      driveId: webhook.driveId,
      driveName: webhook.name,
      createdAt: row.createdAt,
    },
    { status: 201 },
  );
}
