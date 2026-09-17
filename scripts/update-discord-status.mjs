#!/usr/bin/env node
/**
 * Met à jour les salons vocaux "statut" (verrouillés, personne ne peut les
 * rejoindre — juste les voir) sur le guild de stockage Discord : stockage
 * total utilisé, nombre de comptes, membres du serveur Discord, abonnés
 * Patreon actifs. Lancé une fois par heure par
 * .github/workflows/discord-status.yml — jamais de fréquence plus élevée,
 * Discord limite les renommages de salon à 2 par 10 min.
 *
 * Pas de dépendance npm : `pg` (déjà utilisé par l'app) et `fetch` natif.
 */
import { Client } from "pg";

const {
  DATABASE_URL,
  DISCORD_BOT_TOKEN,
  DISCORD_STORAGE_GUILD_ID,
  CHANNEL_ID_STORAGE,
  CHANNEL_ID_ACCOUNTS,
  CHANNEL_ID_DISCORD_MEMBERS,
  CHANNEL_ID_PATREON,
} = process.env;

for (const [name, value] of Object.entries({
  DATABASE_URL,
  DISCORD_BOT_TOKEN,
  DISCORD_STORAGE_GUILD_ID,
  CHANNEL_ID_STORAGE,
  CHANNEL_ID_ACCOUNTS,
  CHANNEL_ID_DISCORD_MEMBERS,
  CHANNEL_ID_PATREON,
})) {
  if (!value) throw new Error(`Variable d'environnement manquante : ${name}`);
}

/** Même logique que src/lib/utils/format.ts (formatBytes), en JS simple. */
function formatBytes(n) {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} o`;
  const units = ["Kio", "Mio", "Gio", "Tio"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(1)} ${units[i]}`;
}

async function fetchStats() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  try {
    // Séquentiel : un `Client` pg ne supporte pas des requêtes concurrentes.
    const storage = await client.query('SELECT COALESCE(SUM(size), 0) AS total FROM "DriveFile"');
    const accounts = await client.query('SELECT COUNT(*) AS total FROM "User"');
    const patreon = await client.query(
      `SELECT COUNT(*) AS total FROM "User"
       WHERE "patreonTier" > 0
         AND ("patreonExpiresAt" IS NULL OR "patreonExpiresAt" > NOW())`,
    );
    return {
      storageBytes: Number(storage.rows[0].total),
      accountCount: Number(accounts.rows[0].total),
      patreonCount: Number(patreon.rows[0].total),
    };
  } finally {
    await client.end();
  }
}

async function fetchDiscordMemberCount() {
  const res = await fetch(
    `https://discord.com/api/v10/guilds/${DISCORD_STORAGE_GUILD_ID}?with_counts=true`,
    { headers: { Authorization: `Bot ${DISCORD_BOT_TOKEN}` } },
  );
  if (!res.ok) {
    throw new Error(`Échec lecture du guild Discord : HTTP ${res.status}`);
  }
  const guild = await res.json();
  return guild.approximate_member_count ?? 0;
}

async function renameChannel(channelId, name) {
  const res = await fetch(`https://discord.com/api/v10/channels/${channelId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Échec renommage du salon ${channelId} → "${name}" : HTTP ${res.status}${body ? ` — ${body.slice(0, 200)}` : ""}`,
    );
  }
}

const { storageBytes, accountCount, patreonCount } = await fetchStats();
const discordMembers = await fetchDiscordMemberCount();

const updates = [
  [CHANNEL_ID_STORAGE, `💾・Stockage : ${formatBytes(storageBytes)}`],
  [CHANNEL_ID_ACCOUNTS, `🧑・Comptes : ${accountCount}`],
  [CHANNEL_ID_DISCORD_MEMBERS, `👥・Discord : ${discordMembers}`],
  [CHANNEL_ID_PATREON, `💎・Patreon : ${patreonCount}`],
];

for (const [channelId, name] of updates) {
  await renameChannel(channelId, name);
  console.log(`OK — ${name}`);
}
