/**
 * Intégration Patreon → paliers d'abonnement Drivecord.
 *
 * Modèle : on ne raisonne pas « feature de Gold / de Premium » mais en NIVEAUX
 * numériques (0 → 3). Chaque feature déclare un niveau minimum requis et se
 * débloque avec `patreonTier >= requis`. Comme VIP(3) > Premium(2) > Gold(1),
 * l'héritage « tout ce qu'il y a avant + le nouveau » est automatique.
 *
 * Le palier est calculé depuis le montant réellement engagé par le mécène
 * (`currently_entitled_amount_cents`) via l'API Patreon v2, puis stocké sur
 * `User.patreonTier`. Les tokens OAuth sont gérés par l'adapter Prisma (table
 * `Account`, provider = "patreon") ; on les relit ici pour interroger l'API et
 * on les rafraîchit au besoin.
 *
 * Variables d'environnement (mêmes noms que le provider Auth.js) :
 *   AUTH_PATREON_ID, AUTH_PATREON_SECRET
 */
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { syncDiscordRoles } from "@/lib/discord-roles";

// ── Paliers ───────────────────────────────────────────────────────────────

export const PATREON_TIER = {
  NONE: 0,
  GOLD: 1,
  PREMIUM: 2,
  VIP: 3,
} as const;

export type PatreonTier = 0 | 1 | 2 | 3;

export const TIER_LABEL: Record<PatreonTier, string> = {
  0: "Gratuit",
  1: "Gold",
  2: "Premium",
  3: "VIP",
};

/**
 * Montant engagé (centimes) → palier. Seuils : 500 = Gold, 1000 = Premium,
 * 1500 = VIP. Un montant intermédiaire retombe sur le palier inférieur atteint.
 */
export function centsToTier(cents: number): PatreonTier {
  if (cents >= 1500) return PATREON_TIER.VIP;
  if (cents >= 1000) return PATREON_TIER.PREMIUM;
  if (cents >= 500) return PATREON_TIER.GOLD;
  return PATREON_TIER.NONE;
}

// ── API Patreon v2 ──────────────────────────────────────────────────────────

const OAUTH_TOKEN_URL = "https://www.patreon.com/api/oauth2/token";
// `include=memberships` + le montant engagé : c'est ce qui nous dit à quel
// palier de NOTRE campagne le mécène est abonné (le client OAuth ne voit que
// les memberships liés à notre campagne).
const IDENTITY_URL =
  "https://www.patreon.com/api/oauth2/v2/identity" +
  "?include=memberships" +
  "&fields%5Bmember%5D=currently_entitled_amount_cents,patron_status";

export class PatreonApiError extends Error {
  constructor(
    public status: number,
    message = `Patreon API error (${status})`,
  ) {
    super(message);
    this.name = "PatreonApiError";
  }
}

type PatreonMember = {
  type: string;
  attributes?: {
    currently_entitled_amount_cents?: number;
    patron_status?: string | null;
  };
};

/** Interroge l'API identity et renvoie le montant engagé actif (centimes). */
async function fetchEntitledCents(accessToken: string): Promise<number> {
  const res = await fetch(IDENTITY_URL, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  if (!res.ok) throw new PatreonApiError(res.status);

  const json = (await res.json()) as { included?: PatreonMember[] };
  const members = (json.included ?? []).filter((x) => x.type === "member");

  // Un compte peut être mécène de plusieurs campagnes ; on prend le plus haut
  // montant ACTIF (notre client ne devrait de toute façon voir que la nôtre).
  let cents = 0;
  for (const m of members) {
    const active = m.attributes?.patron_status === "active_patron";
    const c = m.attributes?.currently_entitled_amount_cents ?? 0;
    if (active && c > cents) cents = c;
  }
  return cents;
}

type TokenResponse = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

/** Échange un refresh_token contre un nouveau couple de tokens. */
async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const clientId = process.env.AUTH_PATREON_ID;
  const clientSecret = process.env.AUTH_PATREON_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_PATREON_ID / AUTH_PATREON_SECRET manquants.");
  }

  const res = await fetch(OAUTH_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
    }),
    cache: "no-store",
  });
  if (!res.ok) throw new PatreonApiError(res.status);
  return (await res.json()) as TokenResponse;
}

// ── Synchro palier ──────────────────────────────────────────────────────────

/** Marge (s) avant expiration à partir de laquelle on rafraîchit le token. */
const TOKEN_REFRESH_MARGIN_S = 60;

export type SyncResult = {
  linked: boolean;
  /** true si le palier est un octroi manuel protégé (non touché par la synchro). */
  manual: boolean;
  tier: PatreonTier;
};

/** true si une date d'expiration est définie et déjà passée. */
export function isExpired(expiresAt: Date | null): boolean {
  return !!expiresAt && expiresAt.getTime() <= Date.now();
}

/**
 * Relit le compte Patreon lié de l'utilisateur, rafraîchit le token si besoin,
 * interroge l'API et met à jour `User.patreonTier`. Idempotent : sûr à appeler
 * au linking, au login, ou depuis le webhook.
 *
 * ⚠️ Un palier MANUEL (posé par l'admin) non expiré est intouchable : on ne le
 * ré-écrase jamais depuis Patreon. S'il est expiré, on le nettoie puis on
 * reprend la synchro normale.
 */
export async function syncUserPatreonTier(userId: string): Promise<SyncResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { patreonTier: true, patreonManual: true, patreonExpiresAt: true },
  });
  if (!user) return { linked: false, manual: false, tier: 0 };

  // Palier manuel encore valide → intouchable.
  if (user.patreonManual && !isExpired(user.patreonExpiresAt)) {
    return { linked: false, manual: true, tier: user.patreonTier as PatreonTier };
  }
  // Palier manuel expiré → on nettoie avant de reprendre la synchro Patreon.
  if (user.patreonManual && isExpired(user.patreonExpiresAt)) {
    await prisma.user.update({
      where: { id: userId },
      data: { patreonTier: 0, patreonManual: false, patreonExpiresAt: null },
    });
  }

  const account = await prisma.account.findFirst({
    where: { userId, provider: "patreon" },
    select: { access_token: true, refresh_token: true, expires_at: true },
  });
  if (!account?.access_token) return { linked: false, manual: false, tier: 0 };

  let accessToken = account.access_token;

  // Rafraîchir si le token est expiré (ou sur le point de l'être).
  const now = Math.floor(Date.now() / 1000);
  if (
    account.expires_at &&
    account.expires_at - TOKEN_REFRESH_MARGIN_S <= now &&
    account.refresh_token
  ) {
    const t = await refreshAccessToken(account.refresh_token);
    accessToken = t.access_token;
    await prisma.account.updateMany({
      where: { userId, provider: "patreon" },
      data: {
        access_token: t.access_token,
        refresh_token: t.refresh_token,
        expires_at: now + t.expires_in,
      },
    });
  }

  const cents = await fetchEntitledCents(accessToken);
  const tier = centsToTier(cents);

  await prisma.user.update({
    where: { id: userId },
    data: { patreonTier: tier, patreonSyncedAt: new Date() },
  });
  await syncDiscordRoles(userId, tier).catch(() => {});

  return { linked: true, manual: false, tier };
}

/** Délie Patreon : supprime le compte OAuth et remet le palier à 0. */
export async function unlinkPatreon(userId: string): Promise<void> {
  await prisma.account.deleteMany({ where: { userId, provider: "patreon" } });
  await prisma.user.update({
    where: { id: userId },
    data: {
      patreonTier: PATREON_TIER.NONE,
      patreonSyncedAt: null,
      patreonManual: false,
      patreonExpiresAt: null,
    },
  });
}

// ── Gating (à utiliser côté serveur) ─────────────────────────────────────────

/**
 * Palier EFFECTIF courant (0 si non lié ou expiré). Si un palier est expiré, on
 * le nettoie au passage (auto-réparation, une seule écriture).
 */
export async function getUserTier(userId: string): Promise<PatreonTier> {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { patreonTier: true, patreonExpiresAt: true },
  });
  if (!u) return 0;
  if (isExpired(u.patreonExpiresAt)) {
    await prisma.user
      .update({
        where: { id: userId },
        data: { patreonTier: 0, patreonManual: false, patreonExpiresAt: null },
      })
      .catch(() => {});
    await syncDiscordRoles(userId, 0).catch(() => {});
    return 0;
  }
  return (u.patreonTier ?? 0) as PatreonTier;
}

/** `true` si l'utilisateur a AU MOINS le palier `min` (héritage inclus). */
export async function hasTier(userId: string, min: PatreonTier): Promise<boolean> {
  return (await getUserTier(userId)) >= min;
}

// ── Webhook temps réel ───────────────────────────────────────────────────────

/**
 * Vérifie la signature d'un webhook Patreon. Patreon envoie un HMAC-MD5 du
 * corps brut, clé = secret du webhook, dans l'en-tête `X-Patreon-Signature`.
 * Lit PATREON_WEBHOOK_SECRET.
 */
export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const secret = process.env.PATREON_WEBHOOK_SECRET;
  if (!secret || !signature) return false;
  const expected = crypto.createHmac("md5", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  // timingSafeEqual exige des longueurs égales.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

type PatreonWebhookPayload = {
  data?: {
    attributes?: { currently_entitled_amount_cents?: number };
    relationships?: { user?: { data?: { id?: string } } };
  };
};

/**
 * Applique une mise à jour de membership reçue par webhook. On retrouve
 * l'utilisateur via l'id Patreon du mécène (= `providerAccountId` de son compte
 * lié) et on recalcule son palier. Un event de suppression force le palier à 0.
 * Renvoie `true` si un utilisateur a été mis à jour.
 */
export async function applyMembershipUpdate(
  payload: PatreonWebhookPayload,
  deleted: boolean,
): Promise<boolean> {
  const patreonUserId = payload?.data?.relationships?.user?.data?.id;
  if (!patreonUserId) return false;

  const account = await prisma.account.findFirst({
    where: { provider: "patreon", providerAccountId: patreonUserId },
    select: { userId: true },
  });
  if (!account) return false;

  // Palier manuel valide → protégé, on ignore l'event Patreon.
  const u = await prisma.user.findUnique({
    where: { id: account.userId },
    select: { patreonManual: true, patreonExpiresAt: true },
  });
  if (u?.patreonManual && !isExpired(u.patreonExpiresAt)) return false;

  const cents = deleted
    ? 0
    : payload?.data?.attributes?.currently_entitled_amount_cents ?? 0;
  const tier = centsToTier(cents);

  await prisma.user.update({
    where: { id: account.userId },
    data: { patreonTier: tier, patreonSyncedAt: new Date() },
  });
  await syncDiscordRoles(account.userId, tier).catch(() => {});
  return true;
}
