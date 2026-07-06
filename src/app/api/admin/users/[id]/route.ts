/**
 * DELETE /api/admin/users/[id] — delete any account (admin only).
 * Cascades to the user's accounts, sessions, webhooks, files and folders.
 *
 * PATCH  /api/admin/users/[id] — set a user's Patreon tier by hand (admin only).
 * Body: { patreonTier: 0 | 1 | 2 | 3 }. Override manuel : n'est pas écrasé par la
 * synchro Patreon tant qu'aucun compte Patreon réel n'est lié.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin";

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
  const body = (await req.json().catch(() => ({}))) as { patreonTier?: unknown };
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

  const updated = await prisma.user.update({
    where: { id },
    data: { patreonTier: tier, patreonSyncedAt: new Date() },
    select: { id: true, email: true, patreonTier: true },
  });
  return NextResponse.json(updated);
}
