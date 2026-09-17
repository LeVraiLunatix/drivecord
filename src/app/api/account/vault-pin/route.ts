/**
 * Vault PIN management.
 *
 * GET   → { hasPin, salt, wrappedKey, wrappedKeyIv } — is a vault PIN set?
 * PATCH → { currentPin?, newPin, salt, wrappedKey, wrappedKeyIv } — set or change the PIN
 * POST  → { pin } → { ok, salt, wrappedKey, wrappedKeyIv } — verify the PIN (to unlock the vault)
 *
 * The vault master key (the key that actually encrypts file content) is
 * generated once on the client and never leaves it in raw form — only
 * wrapped (AES-GCM-encrypted) under a PIN-derived KEK. Changing the PIN only
 * re-wraps this blob client-side and uploads the new wrapping; it never
 * requires (or causes) re-encrypting existing files.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { vaultPin: true, vaultSalt: true, vaultKeyWrapped: true, vaultKeyIv: true },
  });
  return NextResponse.json({
    hasPin: Boolean(user?.vaultPin),
    salt: user?.vaultSalt ?? null,
    wrappedKey: user?.vaultKeyWrapped ?? null,
    wrappedKeyIv: user?.vaultKeyIv ?? null,
  });
}

export async function PATCH(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const rl = await rateLimit(`vaultpin:patch:${session.user.id}`, 10, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });
  }

  const { currentPin, newPin, salt, wrappedKey, wrappedKeyIv } = (await req.json()) as {
    currentPin?: string;
    newPin?: string;
    salt?: string;
    wrappedKey?: string;
    wrappedKeyIv?: string;
  };
  if (!newPin || !/^\d{4,12}$/.test(newPin)) {
    return NextResponse.json({ error: "Le code doit faire 4 à 12 chiffres." }, { status: 400 });
  }
  if (!salt || !wrappedKey || !wrappedKeyIv) {
    return NextResponse.json({ error: "Clé de coffre manquante." }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { vaultPin: true },
  });
  if (user?.vaultPin) {
    if (!currentPin || !(await bcrypt.compare(currentPin, user.vaultPin))) {
      return NextResponse.json({ error: "Code actuel incorrect." }, { status: 400 });
    }
  }

  const hash = await bcrypt.hash(newPin, 10);
  await prisma.user.update({
    where: { id: session.user.id },
    data: { vaultPin: hash, vaultSalt: salt, vaultKeyWrapped: wrappedKey, vaultKeyIv: wrappedKeyIv },
  });
  return NextResponse.json({ ok: true, salt, wrappedKey, wrappedKeyIv });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const rl = await rateLimit(`vaultpin:verify:${session.user.id}`, 10, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json({ ok: false, error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });
  }

  const { pin } = (await req.json()) as { pin?: string };
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { vaultPin: true, vaultSalt: true, vaultKeyWrapped: true, vaultKeyIv: true },
  });
  if (!user?.vaultPin || !pin) return NextResponse.json({ ok: false });
  const ok = await bcrypt.compare(pin, user.vaultPin);
  if (!ok) return NextResponse.json({ ok: false, salt: null });

  return NextResponse.json({
    ok: true,
    salt: user.vaultSalt,
    wrappedKey: user.vaultKeyWrapped,
    wrappedKeyIv: user.vaultKeyIv,
  });
}
