/**
 * DELETE /api/admin/users/[id] — delete any account (admin only).
 * Cascades to the user's accounts, sessions, webhooks, files and folders.
 *
 * PATCH  /api/admin/users/[id] — set a user's Patreon tier by hand (admin only).
 * Body: { patreonTier: 0|1|2|3, expiresAt?: string|null }.
 *   - expiresAt null/absent = à vie ; sinon date ISO à laquelle le palier expire.
 *   - tier 0 = retire tout (palier + manuel + expiration).
 * Marque le palier comme MANUEL : protégé de la synchro/webhook Patreon.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin";
import { syncDiscordRoles } from "@/lib/discord-roles";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;

  // Don't let the admin delete their own account from here.
  if (session.user?.id === id) {
    return NextResponse.json(
      { error: "Utilise les Paramètres pour supprimer ton propre compte." },
      { status: 400 },
    );
  }

  await prisma.user.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    patreonTier?: unknown;
    expiresAt?: unknown;
  };
  const tier = body.patreonTier;

  if (
    typeof tier !== "number" ||
    !Number.isInteger(tier) ||
    tier < 0 ||
    tier > 3
  ) {
    return NextResponse.json(
      { error: "Palier invalide (attendu 0 à 3)." },
      { status: 400 },
    );
  }

  // expiresAt : null/absent = à vie ; une string ISO valide = date d'expiration.
  let expiresAt: Date | null = null;
  if (body.expiresAt != null) {
    const d = new Date(body.expiresAt as string);
    if (Number.isNaN(d.getTime())) {
      return NextResponse.json(
        { error: "Date d'expiration invalide." },
        { status: 400 },
      );
    }
    expiresAt = d;
  }

  const updated = await prisma.user.update({
    where: { id },
    data:
      tier === 0
        ? {
            // Palier retiré → on nettoie tout.
            patreonTier: 0,
            patreonManual: false,
            patreonExpiresAt: null,
            patreonSyncedAt: new Date(),
          }
        : {
            // Octroi manuel protégé de la synchro Patreon.
            patreonTier: tier,
            patreonManual: true,
            patreonExpiresAt: expiresAt,
            patreonSyncedAt: new Date(),
          },
    select: {
      id: true,
      email: true,
      patreonTier: true,
      patreonExpiresAt: true,
    },
  });
  // Aligne le rôle Discord sur le nouveau palier (no-op si Discord non lié/config).
  await syncDiscordRoles(id, updated.patreonTier).catch(() => {});
  return NextResponse.json(updated);
}
