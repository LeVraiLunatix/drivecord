/**
 * "Configuration automatique" — provisionne un salon + webhook Discord privés
 * via le bot Drivebot, pour les utilisateurs qui ne veulent pas créer un
 * webhook manuellement.
 *
 * GET  → { available, discordLinked, alreadyConfigured } — état pour l'UI,
 *        aucun appel Discord (juste des lectures DB + variables d'env).
 * POST → { webhookUrl, name, channelId, guildId, reused }
 *        L'URL n'est PAS persistée ici : le frontend la fait passer par le
 *        même pipeline qu'une saisie manuelle (addDriveFromWebhook puis
 *        POST /api/webhooks), qui chiffre et stocke exactement pareil.
 *        Idempotent : si un webhook existe déjà pour cet utilisateur sur le
 *        guild de stockage, on renvoie celui-là au lieu d'en créer un autre
 *        (évite d'accumuler des salons — un serveur Discord est plafonné à
 *        ~500 salons).
 */
import { NextResponse } from "next/server";
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
    return NextResponse.json({ available: false, discordLinked: false, alreadyConfigured: false });
  }

  const userId = session.user.id;
  const guildId = process.env.DISCORD_STORAGE_GUILD_ID!;
  const [account, existing] = await Promise.all([
    prisma.account.findFirst({ where: { userId, provider: "discord" }, select: { provider: true } }),
    prisma.webhook.findFirst({ where: { userId, guildId }, select: { id: true } }),
  ]);

  return NextResponse.json({
    available: true,
    discordLinked: Boolean(account),
    alreadyConfigured: Boolean(existing),
  });
}

export async function POST() {
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
    select: { provider: true },
  });
  if (!account) {
    return NextResponse.json(
      { error: "Lie ton compte Discord avant d'utiliser la configuration automatique." },
      { status: 400 },
    );
  }

  // Idempotence : un webhook existe déjà pour cet utilisateur sur le guild de
  // stockage → on le renvoie tel quel plutôt que de créer un salon en plus.
  const guildId = process.env.DISCORD_STORAGE_GUILD_ID!;
  const existing = await prisma.webhook.findFirst({ where: { userId, guildId } });
  if (existing) {
    return NextResponse.json({
      webhookUrl: decryptUrl(existing.encryptedUrl),
      name: existing.name,
      channelId: existing.channelId,
      guildId: existing.guildId,
      reused: true,
    });
  }

  try {
    const result = await provisionStorageWebhook(userId);
    return NextResponse.json({ ...result, reused: false }, { status: 201 });
  } catch (err) {
    if (err instanceof DiscordBotError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[webhooks/auto-setup]", err);
    return NextResponse.json({ error: "Erreur interne du serveur." }, { status: 500 });
  }
}
