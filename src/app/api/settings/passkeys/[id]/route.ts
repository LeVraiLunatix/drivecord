/**
 * /api/settings/passkeys/[id]
 *
 * PATCH  → rename { name }
 * DELETE → remove, unless it's the user's only remaining way to sign in.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { name?: string };
  const name = body.name?.trim();
  if (!name) {
    return NextResponse.json({ error: "Nom requis." }, { status: 400 });
  }

  const result = await prisma.authenticator.updateMany({
    where: { id, userId: session.user.id },
    data: { name: name.slice(0, 60) },
  });
  if (result.count === 0) {
    return NextResponse.json({ error: "Passkey introuvable." }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;

  const target = await prisma.authenticator.findFirst({
    where: { id, userId },
    select: { id: true },
  });
  if (!target) {
    return NextResponse.json({ error: "Passkey introuvable." }, { status: 404 });
  }

  // Don't let the user lock themselves out: deleting the last passkey is only
  // allowed if they can still sign in another way (password or OAuth account).
  const [user, oauthCount, passkeyCount] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { password: true } }),
    prisma.account.count({ where: { userId } }),
    prisma.authenticator.count({ where: { userId } }),
  ]);
  const hasOtherFactor =
    Boolean(user?.password) || oauthCount > 0 || passkeyCount > 1;
  if (!hasOtherFactor) {
    return NextResponse.json(
      {
        error:
          "Impossible de supprimer ton dernier moyen de connexion. Ajoute un mot de passe ou un autre passkey d'abord.",
      },
      { status: 409 },
    );
  }

  await prisma.authenticator.delete({ where: { id: target.id } });
  return new NextResponse(null, { status: 204 });
}
