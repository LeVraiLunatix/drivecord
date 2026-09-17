/**
 * "Configuration automatique" — provisionne un salon + un webhook privés pour
 * un utilisateur sur le serveur Discord de stockage officiel, via le BOT
 * Drivebot (jamais via un token OAuth utilisateur). Un utilisateur peut en
 * provisionner plusieurs (chacun avec son propre nom) ; tous ses salons sont
 * regroupés dans sa propre catégorie (voir `findOrCreateUserCategory`).
 *
 * Le salon est rendu invisible à `@everyone` sur ce serveur. C'est une mesure
 * D'ORGANISATION (éviter que les salons de stockage des utilisateurs polluent
 * le serveur communauté), PAS une mesure de confidentialité : le contenu des
 * fichiers est chiffré côté client (AES-256-GCM) AVANT l'upload, donc même
 * quelqu'un qui aurait accès au salon Discord brut (admin du serveur, membre
 * du staff Discord…) ne peut pas lire les fichiers.
 *
 * Le propriétaire du drive obtient un accès lecture seule à SON salon (voir
 * `joinStorageGuild`) : Discord n'autorise un permission overwrite que pour
 * quelqu'un qui est déjà membre du serveur, donc on l'y ajoute d'abord (via
 * son access_token OAuth, scope `guilds.join` — voir auth.ts) avant de créer
 * le salon. Best-effort : si le join échoue (token expiré, scope absent sur
 * un lien Discord fait avant l'ajout de `guilds.join`…), le salon est quand
 * même créé, juste sans overwrite propriétaire.
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
 * (MANAGE_CHANNELS), Gérer les webhooks (MANAGE_WEBHOOKS) et Gérer les rôles
 * (MANAGE_ROLES — requis par Discord pour accorder une permission de salon à
 * un membre autre que le bot lui-même).
 */
import { DISCORD_API_BASE } from "./constants";

// Discord permission bits (voir https://discord.com/developers/docs/topics/permissions).
// BigInt(...) plutôt que des littéraux `10n` : la cible TS du projet (ES2017)
// n'accepte pas la syntaxe des littéraux BigInt.
const PERM_VIEW_CHANNEL = BigInt(1) << BigInt(10);
const PERM_MANAGE_CHANNELS = BigInt(1) << BigInt(4);
const PERM_READ_MESSAGE_HISTORY = BigInt(1) << BigInt(16);
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

/**
 * Ajoute (ou confirme la présence de) l'utilisateur comme membre du guild de
 * stockage, via son propre access_token OAuth (scope `guilds.join`). Requis
 * pour que le permission overwrite lecture seule de son salon soit accepté
 * par Discord (un overwrite ne peut viser qu'un membre existant). Best-effort
 * : ne lève jamais — un token expiré ou un lien Discord fait avant l'ajout du
 * scope `guilds.join` ne doit pas empêcher la création du salon/webhook.
 */
async function joinStorageGuild(
  guildId: string,
  discordUserId: string,
  userAccessToken: string,
): Promise<boolean> {
  try {
    const res = await botFetch(`/guilds/${guildId}/members/${discordUserId}`, {
      method: "PUT",
      body: JSON.stringify({ access_token: userAccessToken }),
    });
    // 201 (ajouté) ou 204 (déjà membre) : succès.
    if (res.ok) return true;
    console.error(
      `[discord/storage-guild] échec ajout membre ${discordUserId} : HTTP ${res.status}`,
    );
    return false;
  } catch (err) {
    console.error(`[discord/storage-guild] échec ajout membre ${discordUserId}`, err);
    return false;
  }
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
 * Retrouve (ou crée) la catégorie d'un utilisateur, qui regroupe TOUS ses
 * salons de stockage (un utilisateur peut avoir plusieurs drives). Une
 * catégorie par utilisateur plutôt qu'une catégorie partagée : permet de
 * créer beaucoup plus de drives au total avant d'atteindre la limite Discord
 * de ~500 salons/catégories par serveur, et garde chaque utilisateur
 * facilement repérable pour un admin qui parcourt le serveur.
 *
 * Comme pour les salons, la recherche se fait par nom exact — si l'admin
 * renomme une catégorie utilisateur à la main, une nouvelle sera recréée à
 * côté au prochain drive de cet utilisateur.
 */
async function findOrCreateUserCategory(guildId: string, categoryName: string): Promise<string> {
  const res = await botFetchOrThrow(
    `/guilds/${guildId}/channels`,
    { method: "GET" },
    "lister les salons du serveur",
  );
  const channels = (await res.json()) as DiscordChannel[];
  const existing = channels.find((c) => c.type === 4 && c.name === categoryName);
  if (existing) return existing.id;

  const created = await botFetchOrThrow(
    `/guilds/${guildId}/channels`,
    { method: "POST", body: JSON.stringify({ name: categoryName, type: 4 }) },
    "créer la catégorie de l'utilisateur",
  );
  const category = (await created.json()) as DiscordChannel;
  return category.id;
}

/**
 * Crée le salon privé d'un utilisateur : invisible à `@everyone`, en lecture
 * seule pour son propriétaire (voir/retrouver son salon, jamais
 * envoyer/gérer — évite qu'il casse le stockage en supprimant un message à
 * la main) si `ownerDiscordId` est fourni ET que le join du guild (voir
 * `joinStorageGuild`) a réussi, et pleinement géré par le bot (qui en a
 * besoin pour créer/gérer le webhook).
 */
async function createUserChannel(
  guildId: string,
  categoryId: string,
  channelName: string,
  ownerDiscordId?: string,
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
        // aussi à lui. Le propriétaire (si fourni) : lecture seule.
        permission_overwrites: [
          { id: guildId, type: 0, deny: PERM_VIEW_CHANNEL.toString() },
          {
            id: botUserId,
            type: 1,
            allow: (PERM_VIEW_CHANNEL | PERM_MANAGE_CHANNELS | PERM_MANAGE_WEBHOOKS).toString(),
          },
          ...(ownerDiscordId
            ? [
                {
                  id: ownerDiscordId,
                  type: 1,
                  allow: (PERM_VIEW_CHANNEL | PERM_READ_MESSAGE_HISTORY).toString(),
                },
              ]
            : []),
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
 * Nom de salon/catégorie Discord valide à partir d'un texte libre (pseudo
 * Drivecord ou nom de drive choisi par l'utilisateur) : minuscules,
 * alphanumérique + tirets, tronqué. Vide/invalide → repli sur `fallback`
 * (typiquement l'id utilisateur). Pas garanti unique (deux salons/catégories
 * peuvent en théorie partager le même nom) — sans conséquence fonctionnelle,
 * seul l'id stocké en base identifie le salon.
 */
function slugify(text: string | null | undefined, fallback: string): string {
  const slug = (text ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return slug || fallback.toLowerCase();
}

/**
 * Provisionne un salon + un webhook de stockage pour `userId` sur le guild de
 * stockage actif. `driveName` (choisi par l'utilisateur au setup) nomme le
 * salon ; à défaut, replie sur le pseudo Drivecord puis sur l'id.
 */
export async function provisionStorageWebhook(
  userId: string,
  userName?: string | null,
  ownerDiscordId?: string,
  ownerAccessToken?: string | null,
  driveName?: string | null,
): Promise<ProvisionedWebhook> {
  const guildId = resolveStorageGuild();
  const categoryName = `👤・${slugify(userName, userId)}`;
  const channelName = `drive-${slugify(driveName ?? userName, userId)}`;

  const joined =
    ownerDiscordId && ownerAccessToken
      ? await joinStorageGuild(guildId, ownerDiscordId, ownerAccessToken)
      : false;

  const categoryId = await findOrCreateUserCategory(guildId, categoryName);
  const channelId = await createUserChannel(
    guildId,
    categoryId,
    channelName,
    joined ? ownerDiscordId : undefined,
  );
  const webhookName = driveName?.trim() || "Mon drive Discord";
  const webhookUrl = await createChannelWebhook(channelId, webhookName);

  return {
    webhookUrl,
    name: webhookName,
    channelId,
    guildId,
  };
}

/**
 * Supprime le salon de stockage d'un utilisateur (compte ou drive supprimé).
 * Best-effort : un salon déjà supprimé manuellement ou une permission
 * manquante ne doit jamais faire échouer la suppression du compte/drive côté
 * Drivecord.
 */
export async function deleteStorageChannel(channelId: string): Promise<void> {
  try {
    const res = await botFetch(`/channels/${channelId}`, { method: "DELETE" });
    if (!res.ok && res.status !== 404) {
      console.error(
        `[discord/storage-guild] échec suppression salon ${channelId} : HTTP ${res.status}`,
      );
    }
  } catch (err) {
    console.error(`[discord/storage-guild] échec suppression salon ${channelId}`, err);
  }
}
