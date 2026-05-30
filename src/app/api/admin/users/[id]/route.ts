/**
 * DELETE /api/admin/users/[id] — delete any account (admin only).
 * Cascades to the user's accounts, sessions, webhooks, files and folders.
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
