/**
 * POST /api/webhooks/patreon — webhook temps réel des memberships Patreon.
 *
 * Patreon appelle cette route à chaque changement d'abonnement (création,
 * upgrade/downgrade, résiliation). On vérifie la signature HMAC-MD5, puis on
 * recalcule le palier de l'utilisateur concerné. Le type d'event est dans
 * l'en-tête `X-Patreon-Event` (members:create / members:update / members:delete
 * / members:pledge:*). Les events de suppression remettent le palier à 0.
 *
 * À configurer côté Patreon (Developer Portal → Webhooks) :
 *   URL     : https://drivecord.app/api/webhooks/patreon
 *   Secret  : PATREON_WEBHOOK_SECRET (env Vercel)
 *   Events  : members:create, members:update, members:delete
 */
import { NextRequest, NextResponse } from "next/server";
import {
  verifyWebhookSignature,
  applyMembershipUpdate,
} from "@/lib/patreon";

export async function POST(req: NextRequest) {
  // Corps BRUT requis pour valider la signature (ne pas parser avant).
  const raw = await req.text();
  const signature = req.headers.get("x-patreon-signature");

  if (!verifyWebhookSignature(raw, signature)) {
    return NextResponse.json({ error: "Signature invalide." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Corps invalide." }, { status: 400 });
  }

  const event = req.headers.get("x-patreon-event") ?? "";
  const deleted = event.includes("delete");

  // Non bloquant : on répond toujours 204 pour éviter que Patreon ne réémette
  // en boucle si notre traitement échoue (ex. mécène non lié chez nous).
  await applyMembershipUpdate(
    payload as Parameters<typeof applyMembershipUpdate>[0],
    deleted,
  ).catch(() => {});

  return new NextResponse(null, { status: 204 });
}
