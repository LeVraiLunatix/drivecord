/**
 * "Configuration automatique" — provisionne un salon + un webhook privés pour
 * un utilisateur sur le serveur Discord de stockage officiel, via le BOT
 * Drivebot (jamais via un token OAuth utilisateur).
 *
 * Le salon est rendu invisible à `@everyone` sur ce serveur. C'est une mesure
 * D'ORGANISATION (éviter que les salons de stockage des utilisateurs polluent
 * le serveur communauté), PAS une mesure de confidentialité : le contenu des
 * fichiers est chiffré côté client (AES-256-GCM) AVANT l'upload, donc même
 * quelqu'un qui aurait accès au salon Discord brut (admin du serveur, membre
 * du staff Discord…) ne peut pas lire les fichiers.
 *
 * Variables d'environnement :
 *   DISCORD_BOT_TOKEN         token du bot (déjà utilisé par discord-roles.ts)
 *   DISCORD_STORAGE_GUILD_ID  serveur où provisionner les salons de stockage
 *
 * Volontairement séparé de DISCORD_GUILD_ID (rôles Patreon) : un serveur
 * Discord est plafonné à ~500 salons, donc ce guild de stockage devra
 * probablement être remplacé/éclaté indépendamment du serveur communauté.
 * `resolveStorageGuild()` est le seul point qui connaît le guild actif —
 * c'est le seam à étendre le jour où il faut répartir sur plusieurs guilds.
 *
 * Permissions bot requises sur DISCORD_STORAGE_GUILD_ID : Gérer les salons
 * (MANAGE_CHANNELS) et Gérer les webhooks (MANAGE_WEBHOOKS).
 */
import { DISCORD_API_BASE } from "./constants";

const CATEGORY_NAME = "☁ Drivecord Storage";

// Discord permission bits (voir https://discord.com/developers/docs/topics/permissions).
// BigInt(...) plutôt que des littéraux `10n` : la cible TS du projet (ES2017)
// n'accepte pas la syntaxe des littéraux BigInt.
const PERM_VIEW_CHANNEL = BigInt(1) << BigInt(10);
const PERM_MANAGE_CHANNELS = BigInt(1) << BigInt(4);
const PERM_MANAGE_WEBHOOKS = BigInt(1) << BigInt(29);

export class DiscordBotError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "DiscordBotError";
  }
}

/**
 * Le guild Discord actif pour la configuration automatique. Seul point de
 * résolution : le jour où il faut répartir les utilisateurs sur plusieurs
 * guilds (limite Discord de ~500 salons/serveur), seule cette fonction change.
 */
export function resolveStorageGuild(): string {
  const guildId = process.env.DISCORD_STORAGE_GUILD_ID;
  if (!guildId) {
    throw new DiscordBotError("Configuration automatique non disponible sur ce serveur.", 501);
  }
  return guildId;
}

function getBotToken(): string {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) {
    throw new DiscordBotError("Configuration automatique non disponible sur ce serveur.", 501);
  }
  return token;
}

/** Appelle l'API Discord avec le token bot ; retente une fois sur un 429. */
async function botFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getBotToken();
  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
    ...init.headers,
  };

  let res = await fetch(`${DISCORD_API_BASE}${path}`, { ...init, headers });
  if (res.status === 429) {
    const body = await res.json().catch(() => ({}) as { retry_after?: number });
    const retryAfterMs = Math.ceil((body.retry_after ?? 1) * 1000) + 250;
    await new Promise((r) => setTimeout(r, retryAfterMs));
    res = await fetch(`${DISCORD_API_BASE}${path}`, { ...init, headers });
  }
  return res;
}

async function botFetchOrThrow(path: string, init: RequestInit, context: string): Promise<Response> {
  const res = await botFetch(path, init);
  if (!res.ok) {
    if (res.status === 403) {
      throw new DiscordBotError(
        `Le bot Drivecord n'a pas la permission nécessaire pour : ${context}.`,
        403,
      );
    }
    const body = await res.text().catch(() => "");
    throw new DiscordBotError(
      `Échec Discord (${context}) : HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
      502,
    );
  }
  return res;
}

/** Id Discord du bot lui-même — mis en cache pour toute la durée du process. */
let botUserIdPromise: Promise<string> | null = null;
function getBotUserId(): Promise<string> {
  if (!botUserIdPromise) {
    botUserIdPromise = botFetchOrThrow("/users/@me", { method: "GET" }, "lire son propre profil")
      .then((r) => r.json())
      .then((u: { id: string }) => u.id)
      .catch((err) => {
        botUserIdPromise = null; // ne pas mettre un échec en cache
        throw err;
      });
  }
  return botUserIdPromise;
}

type DiscordChannel = { id: string; type: number; name: string; parent_id?: string | null };

/**
 * Retrouve (ou crée) la catégorie qui regroupe les salons de stockage
 * auto-provisionnés, pour ne pas polluer la racine du serveur.
 */
async function findOrCreateStorageCategory(guildId: string): Promise<string> {
  const res = await botFetchOrThrow(
    `/guilds/${guildId}/channels`,
    { method: "GET" },
    "lister les salons du serveur",
  );
  const channels = (await res.json()) as DiscordChannel[];
  const existing = channels.find((c) => c.type === 4 && c.name === CATEGORY_NAME);
  if (existing) return existing.id;

  const created = await botFetchOrThrow(
    `/guilds/${guildId}/channels`,
    { method: "POST", body: JSON.stringify({ name: CATEGORY_NAME, type: 4 }) },
    "créer la catégorie de stockage",
  );
  const category = (await created.json()) as DiscordChannel;
  return category.id;
}

/**
 * Crée le salon privé d'un utilisateur : invisible à `@everyone`, visible
 * uniquement par le bot (qui en a besoin pour créer/gérer le webhook).
 */
async function createUserChannel(
  guildId: string,
  categoryId: string,
  channelName: string,
): Promise<string> {
  const botUserId = await getBotUserId();

  const res = await botFetchOrThrow(
    `/guilds/${guildId}/channels`,
    {
      method: "POST",
      body: JSON.stringify({
        name: channelName,
        type: 0, // GUILD_TEXT
        parent_id: categoryId,
        topic:
          "Stockage chiffré Drivecord — géré automatiquement, ne pas modifier ni supprimer manuellement.",
        // @everyone (id = guildId) : caché. Le bot : explicitement autorisé —
        // sans cet overwrite le bot ne pourrait pas voir son propre salon
        // pour y créer le webhook, puisque le deny @everyone s'appliquerait
        // aussi à lui.
        permission_overwrites: [
          { id: guildId, type: 0, deny: PERM_VIEW_CHANNEL.toString() },
          {
            id: botUserId,
            type: 1,
            allow: (PERM_VIEW_CHANNEL | PERM_MANAGE_CHANNELS | PERM_MANAGE_WEBHOOKS).toString(),
          },
        ],
      }),
    },
    "créer le salon de stockage",
  );
  const channel = (await res.json()) as DiscordChannel;
  return channel.id;
}

/** Crée un webhook dans le salon et renvoie son URL complète. */
async function createChannelWebhook(channelId: string, name: string): Promise<string> {
  const res = await botFetchOrThrow(
    `/channels/${channelId}/webhooks`,
    { method: "POST", body: JSON.stringify({ name }) },
    "créer le webhook",
  );
  const webhook = (await res.json()) as { id: string; token: string };
  return `${DISCORD_API_BASE}/webhooks/${webhook.id}/${webhook.token}`;
}

export type ProvisionedWebhook = {
  webhookUrl: string;
  name: string;
  channelId: string;
  guildId: string;
};

/**
 * Provisionne un salon + un webhook de stockage pour `userId` sur le guild de
 * stockage actif. Le nom du salon est dérivé de l'id Drivecord (pas du
 * pseudo) pour ne rien exposer de personnel et éviter les collisions.
 */
export async function provisionStorageWebhook(userId: string): Promise<ProvisionedWebhook> {
  const guildId = resolveStorageGuild();
  const channelName = `drive-${userId.toLowerCase()}`;

  const categoryId = await findOrCreateStorageCategory(guildId);
  const channelId = await createUserChannel(guildId, categoryId, channelName);
  const webhookUrl = await createChannelWebhook(channelId, "Drivecord");

  return { webhookUrl, name: "Mon drive Discord", channelId, guildId };
}
