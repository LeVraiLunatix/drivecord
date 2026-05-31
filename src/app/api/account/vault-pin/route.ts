/**
 * Vault PIN management.
 *
 * GET   → { hasPin }              — is a vault PIN set?
 * PATCH → { currentPin?, newPin } — set or change the PIN
 * POST  → { pin } → { ok }        — verify the PIN (to unlock the vault)
 */
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { vaultPin: true, vaultSalt: true },
  });
  return NextResponse.json({ hasPin: Boolean(user?.vaultPin), salt: user?.vaultSalt ?? null });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { currentPin, newPin } = (await req.json()) as { currentPin?: string; newPin?: string };
  if (!newPin || !/^\d{4,12}$/.test(newPin)) {
    return NextResponse.json({ error: "Le code doit faire 4 à 12 chiffres." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { vaultPin: true, vaultSalt: true },
  });
  if (user?.vaultPin) {
    if (!currentPin || !(await bcrypt.compare(currentPin, user.vaultPin))) {
      return NextResponse.json({ error: "Code actuel incorrect." }, { status: 400 });
    }
  }

  const hash = await bcrypt.hash(newPin, 10);
  // Create the encryption salt once (keeping it stable so existing encrypted
  // files stay decryptable). Derives the vault key together with the PIN.
  const salt = user?.vaultSalt ?? crypto.randomBytes(16).toString("base64");
  await prisma.user.update({
    where: { id: session.user.id },
    data: { vaultPin: hash, vaultSalt: salt },
  });
  return NextResponse.json({ ok: true, salt });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const { pin } = (await req.json()) as { pin?: string };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { vaultPin: true, vaultSalt: true },
  });
  if (!user?.vaultPin || !pin) return NextResponse.json({ ok: false });
  const ok = await bcrypt.compare(pin, user.vaultPin);
  if (!ok) return NextResponse.json({ ok: false, salt: null });

  // Backfill the encryption salt for PINs created before E2EE existed.
  let salt = user.vaultSalt;
  if (!salt) {
    salt = crypto.randomBytes(16).toString("base64");
    await prisma.user.update({ where: { id: session.user.id }, data: { vaultSalt: salt } });
  }
  return NextResponse.json({ ok: true, salt });
}
