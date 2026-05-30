/**
 * PATCH /api/account/password — set or change the account password.
 *
 * Body: { currentPassword?, newPassword }
 *  - If the account already has a password, currentPassword is required and verified.
 *  - OAuth-only accounts (no password yet) can set one without currentPassword.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { currentPassword, newPassword } = (await req.json()) as {
    currentPassword?: string;
    newPassword?: string;
  };

  if (!newPassword || newPassword.length < 8) {
    return NextResponse.json(
      { error: "Le nouveau mot de passe doit faire au moins 8 caractères." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { password: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  // If a password already exists, verify the current one.
  if (user.password) {
    if (!currentPassword) {
      return NextResponse.json(
        { error: "Mot de passe actuel requis." },
        { status: 400 },
      );
    }
    const ok = await bcrypt.compare(currentPassword, user.password);
    if (!ok) {
      return NextResponse.json(
        { error: "Mot de passe actuel incorrect." },
        { status: 400 },
      );
    }
  }

  const hash = await bcrypt.hash(newPassword, 12);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { password: hash },
  });

  return NextResponse.json({ ok: true });
}
