/**
 * GET /api/supporters — liste publique des mécènes (page « Nos mécènes ».)
 *
 * Public (pas d'auth). Ne renvoie QUE nom d'affichage + avatar + palier — jamais
 * l'email. Exclut les comptes masqués (opt-out) et les paliers expirés. Trié du
 * palier le plus haut au plus bas.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { type PatreonTier } from "@/lib/patreon";

export async function GET() {
  const rows = await prisma.user.findMany({
    where: {
      patreonTier: { gt: 0 },
      hideFromSupporters: false,
      OR: [{ patreonExpiresAt: null }, { patreonExpiresAt: { gt: new Date() } }],
    },
    select: { name: true, image: true, patreonTier: true },
    orderBy: [{ patreonTier: "desc" }, { patreonSyncedAt: "asc" }],
  });

  const supporters = rows.map((u) => ({
    name: u.name?.trim() || "Mécène",
    image: u.image,
    tier: (u.patreonTier ?? 0) as PatreonTier,
  }));

  return NextResponse.json({ supporters });
}
