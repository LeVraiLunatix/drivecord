/**
 * "Configuration automatique" — provisionne un ou plusieurs salons + webhooks
 * Discord privés via le bot Drivebot, pour les utilisateurs qui ne veulent
 * pas créer de webhook manuellement. Un utilisateur peut en créer plusieurs
 * (nommés librement) ; tous sont regroupés dans sa propre catégorie sur le
 * guild de stockage (voir src/lib/discord/storage-guild.ts).
 *
 * GET  → { available, discordLinked, drives[] } — état pour l'UI, aucun appel
 *        Discord (juste des lectures DB + variables d'env). `drives` liste
 *        tous les drives déjà auto-provisionnés pour l'utilisateur (pour les
 *        réafficher/réutiliser, comme la méthode manuelle).
 * POST → { webhookUrl, name, channelId, guildId } — crée toujours un NOUVEAU
 *        salon + webhook (accepte { name } en body pour le nommer). L'URL
 *        n'est PAS persistée ici : le frontend la fait passer par le même
 *        pipeline qu'une saisie manuelle (addDriveFromWebhook puis
 *        POST /api/webhooks), qui chiffre et stocke exactement pareil.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { decryptUrl } from "@/lib/auth/encrypt";
import { rateLimit } from "@/lib/rate-limit";
import { DiscordBotError, provisionStorageWebhook } from "@/lib/discord/storage-guild";

function isAutoSetupAvailable(): boolean {
  return Boolean(process.env.DISCORD_BOT_TOKEN && process.env.DISCORD_STORAGE_GUILD_ID);
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  if (!isAutoSetupAvailable()) {
    return NextResponse.json({ available: false, discordLinked: false, drives: [] });
  }

  const userId = session.user.id;
  const guildId = process.env.DISCORD_STORAGE_GUILD_ID!;
  const [account, existing] = await Promise.all([
    prisma.account.findFirst({ where: { userId, provider: "discord" }, select: { provider: true } }),
    prisma.webhook.findMany({
      where: { userId, guildId },
      select: { driveId: true, name: true, channelId: true, encryptedUrl: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);

  return NextResponse.json({
    available: true,
    discordLinked: Boolean(account),
    drives: existing.map((w) => ({
      driveId: w.driveId,
      name: w.name,
      channelId: w.channelId,
      webhookUrl: decryptUrl(w.encryptedUrl),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;

  if (!isAutoSetupAvailable()) {
    return NextResponse.json(
      { error: "Configuration automatique non disponible sur ce serveur." },
      { status: 501 },
    );
  }

  const rl = await rateLimit(`webhooks:autosetup:${userId}`, 5, 60 * 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives, réessaie plus tard." },
      { status: 429 },
    );
  }

  const account = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: { providerAccountId: true, access_token: true },
  });
  if (!account) {
    return NextResponse.json(
      { error: "Lie ton compte Discord avant d'utiliser la configuration automatique." },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const driveName = typeof body.name === "string" ? body.name.trim().slice(0, 80) : undefined;

  try {
    const result = await provisionStorageWebhook(
      userId,
      session.user.name,
      account.providerAccountId,
      account.access_token,
      driveName,
    );
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof DiscordBotError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[webhooks/auto-setup]", err);
    return NextResponse.json({ error: "Erreur interne du serveur." }, { status: 500 });
  }
}
