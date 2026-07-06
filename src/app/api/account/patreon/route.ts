/**
 * /api/account/patreon — état de l'abonnement Patreon de l'utilisateur.
 *
 * GET    → { linked, tier, tierLabel, syncedAt }
 * POST   → resynchronise le palier depuis l'API Patreon, puis renvoie l'état
 * DELETE → délie Patreon (compte OAuth supprimé, palier remis à 0)
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  syncUserPatreonTier,
  unlinkPatreon,
  isExpired,
  TIER_LABEL,
  type PatreonTier,
} from "@/lib/patreon";

async function status(userId: string) {
  const [acct, user] = await Promise.all([
    prisma.account.findFirst({
      where: { userId, provider: "patreon" },
      select: { providerAccountId: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        patreonTier: true,
        patreonSyncedAt: true,
        patreonManual: true,
        patreonExpiresAt: true,
      },
    }),
  ]);
  const expired = isExpired(user?.patreonExpiresAt ?? null);
  const tier = (expired ? 0 : user?.patreonTier ?? 0) as PatreonTier;
  return {
    linked: Boolean(acct),
    manual: Boolean(user?.patreonManual) && !expired,
    tier,
    tierLabel: TIER_LABEL[tier],
    syncedAt: user?.patreonSyncedAt?.getTime() ?? null,
    expiresAt: expired ? null : user?.patreonExpiresAt?.getTime() ?? null,
  };
}

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  return NextResponse.json(await status(session.user.id));
}

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  try {
    const result = await syncUserPatreonTier(session.user.id);
    // Rien à rafraîchir seulement si aucun compte lié ET pas de palier manuel.
    if (!result.linked && !result.manual) {
      return NextResponse.json(
        { error: "Aucun compte Patreon lié." },
        { status: 400 },
      );
    }
  } catch {
    return NextResponse.json(
      { error: "Impossible de contacter Patreon pour l'instant." },
      { status: 502 },
    );
  }
  return NextResponse.json(await status(session.user.id));
}

export async function DELETE() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  await unlinkPatreon(session.user.id);
  return NextResponse.json(await status(session.user.id));
}
