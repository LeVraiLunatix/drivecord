/**
 * Endpoint d'Interactions Discord (webhook) pour le bouton "Se vérifier" du
 * guild de stockage — voir #✅・vérification.
 *
 * Alternative sans bot permanent : Discord ne pousse pas d'événement
 * "membre a rejoint" par simple webhook HTTP (ça demande une connexion
 * Gateway, que ce projet serverless n'a pas). Mais un clic de bouton, si,
 * via cette "Interactions Endpoint URL" configurée sur le portail
 * développeur (Drivebot → General Information). Donc : pas d'assignation
 * automatique d'un rôle "Non vérifié" à l'arrivée — à la place, TOUT sauf le
 * salon de vérification est déjà masqué à `@everyone` par permission de
 * salon, et ce bouton accorde le rôle qui lève ce masquage.
 *
 * Discord signe chaque requête (ed25519) avec la clé publique de
 * l'application — DISCORD_BOT_PUBLIC_KEY. Une requête non vérifiée doit être
 * rejetée en 401, sinon n'importe qui pourrait forger un faux clic.
 */
import { NextRequest, NextResponse } from "next/server";
import nacl from "tweetnacl";
import { DISCORD_API_BASE } from "@/lib/discord/constants";

const VERIFIED_ROLE_ID = "1550144978498494585"; // ✅・Membres vérifiés

// Types Discord minimaux (Interaction/Component) — pas de dépendance externe.
type DiscordInteraction = {
  type: number;
  member?: { user?: { id?: string } };
  data?: { custom_id?: string };
};

function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function verifySignature(rawBody: string, signature: string, timestamp: string): boolean {
  const publicKey = process.env.DISCORD_BOT_PUBLIC_KEY;
  if (!publicKey) return false;
  try {
    return nacl.sign.detached.verify(
      new TextEncoder().encode(timestamp + rawBody),
      hexToUint8Array(signature),
      hexToUint8Array(publicKey),
    );
  } catch {
    return false;
  }
}

async function grantVerifiedRole(userId: string): Promise<boolean> {
  const token = process.env.DISCORD_BOT_TOKEN;
  const guildId = process.env.DISCORD_STORAGE_GUILD_ID;
  if (!token || !guildId) return false;

  const res = await fetch(
    `${DISCORD_API_BASE}/guilds/${guildId}/members/${userId}/roles/${VERIFIED_ROLE_ID}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bot ${token}`,
        "X-Audit-Log-Reason": "Vérification via bouton",
      },
    },
  );
  return res.ok;
}

export async function POST(req: NextRequest) {
  const signature = req.headers.get("X-Signature-Ed25519");
  const timestamp = req.headers.get("X-Signature-Timestamp");
  const rawBody = await req.text();

  if (!signature || !timestamp || !verifySignature(rawBody, signature, timestamp)) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }

  const interaction = JSON.parse(rawBody) as DiscordInteraction;

  // PING (type 1) : Discord valide l'endpoint à chaque enregistrement — doit
  // répondre PONG (type 1) pour que l'URL soit acceptée sur le portail.
  if (interaction.type === 1) {
    return NextResponse.json({ type: 1 });
  }

  // MESSAGE_COMPONENT (type 3) : clic sur le bouton "Se vérifier".
  if (interaction.type === 3 && interaction.data?.custom_id === "verify") {
    const userId = interaction.member?.user?.id;
    const ok = userId ? await grantVerifiedRole(userId) : false;
    return NextResponse.json({
      type: 4,
      data: {
        content: ok
          ? "✅ Vérifié ! Tu as maintenant accès au reste du serveur."
          : "❌ Échec de la vérification. Réessaie dans un instant, ou contacte un admin.",
        flags: 64, // EPHEMERAL — visible seulement par la personne qui clique.
      },
    });
  }

  return NextResponse.json({ error: "Interaction non gérée." }, { status: 400 });
}
