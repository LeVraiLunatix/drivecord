/**
 * Synchronisation des rôles Discord selon le palier Patreon.
 *
 * Un rôle par palier (Gold/Premium/VIP). Quand le palier d'un utilisateur change
 * (paiement, upgrade/downgrade, résiliation, override admin, expiration), on
 * s'assure qu'il possède EXACTEMENT le rôle correspondant sur le serveur Discord
 * (et pas les autres). On retrouve son identifiant Discord via son compte OAuth
 * Discord déjà lié (login Discord).
 *
 * Nécessite un BOT Discord (pas l'OAuth) invité sur le serveur avec la permission
 * « Gérer les rôles », et dont le rôle est positionné AU-DESSUS des rôles de
 * palier dans la hiérarchie du serveur.
 *
 * Variables d'environnement :
 *   DISCORD_BOT_TOKEN      token du bot
 *   DISCORD_GUILD_ID       id du serveur
 *   DISCORD_ROLE_GOLD      id du rôle Gold
 *   DISCORD_ROLE_PREMIUM   id du rôle Premium
 *   DISCORD_ROLE_VIP       id du rôle VIP
 *
 * Tout est no-op si non configuré ou si l'utilisateur n'a pas lié Discord.
 */
import { prisma } from "@/lib/prisma";

const API = "https://discord.com/api/v10";

/** Map palier → variable d'env du rôle. */
function roleIdForTier(tier: number): string | undefined {
  if (tier === 1) return process.env.DISCORD_ROLE_GOLD;
  if (tier === 2) return process.env.DISCORD_ROLE_PREMIUM;
  if (tier === 3) return process.env.DISCORD_ROLE_VIP;
  return undefined;
}

/** Tous les rôles de palier configurés, avec le niveau associé. */
function allTierRoles(): { tier: number; roleId: string }[] {
  return [1, 2, 3]
    .map((tier) => ({ tier, roleId: roleIdForTier(tier) }))
    .filter((r): r is { tier: number; roleId: string } => Boolean(r.roleId));
}

/**
 * Aligne les rôles Discord de l'utilisateur sur son palier effectif.
 * @param userId  id Drivecord
 * @param tier    palier à appliquer ; si omis, lu en base (avec expiration)
 */
export async function syncDiscordRoles(
  userId: string,
  tier?: number,
): Promise<void> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_GUILD_ID;
  if (!token || !guildId) return; // pas configuré

  const roles = allTierRoles();
  if (roles.length === 0) return; // aucun rôle configuré

  // Compte Discord lié = identifiant du membre sur le serveur.
  const acct = await prisma.account.findFirst({
    where: { userId, provider: "discord" },
    select: { providerAccountId: true },
  });
  if (!acct) return; // l'utilisateur n'a pas lié Discord → rien à faire

  // Palier effectif (tenant compte d'une éventuelle expiration).
  let effective = tier;
  if (effective == null) {
    const u = await prisma.user.findUnique({
      where: { id: userId },
      select: { patreonTier: true, patreonExpiresAt: true },
    });
    const expired =
      !!u?.patreonExpiresAt && u.patreonExpiresAt.getTime() <= Date.now();
    effective = expired ? 0 : u?.patreonTier ?? 0;
  }

  const headers = {
    Authorization: `Bot ${token}`,
    "Content-Type": "application/json",
    "X-Audit-Log-Reason": "Synchro palier Patreon Drivecord",
  };
  const memberBase = `${API}/guilds/${guildId}/members/${acct.providerAccountId}/roles`;

  // Pour chaque rôle de palier : le rôle du palier courant → présent, les
  // autres → absents. (Un membre absent du serveur renvoie 404 → ignoré.)
  for (const { tier: lvl, roleId } of roles) {
    const shouldHave = lvl === effective;
    try {
      await fetch(`${memberBase}/${roleId}`, {
        method: shouldHave ? "PUT" : "DELETE",
        headers,
      });
    } catch {
      // réseau : non bloquant, la prochaine synchro rattrapera
    }
  }
}
