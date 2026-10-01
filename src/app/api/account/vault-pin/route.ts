/**
 * Vault PIN management.
 *
 * Two generations live side by side:
 *
 *  • v2 (`vaultKdf` set) — the PIN NEVER reaches the server. The client stretches it with
 *    Argon2id and sends only a `verifier` derived from the result. We store bcrypt(verifier)
 *    and rate-limit guesses; the wrapped vault key is released only for a correct verifier.
 *    The vault master key is wrapped under a PIN-derived key (`v1.<iv>.<ct>`).
 *
 *  • legacy (`vaultKdf` null) — the plain PIN is bcrypt-checked here and the key is wrapped
 *    under a PBKDF2 KEK. Kept only until the next unlock, when the client upgrades it to v2.
 *
 * GET   → { hasPin, salt, wrappedKey, wrappedKeyIv, kdf }
 * POST  → v2: { verifier }   legacy: { pin }   → { ok, … } — verify (to unlock)
 * PATCH → set / change / upgrade. v2 body: { currentVerifier?, newVerifier, kdf, wrappedKey };
 *         legacy body (still accepted): { currentPin?, newPin, salt, wrappedKey, wrappedKeyIv }
 *         `currentPin` is also how a legacy vault authenticates its upgrade to v2.
 */
import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { auth } from "@/auth";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { b64, phraseKdfSchema, wrappedBlob } from "@/lib/e2ee-server";

const verifier = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

const v2Patch = z.object({
  currentVerifier: verifier.optional(),
  /** Legacy vault upgrading to v2: authenticated with its old plain PIN, one last time. */
  currentPin: z.string().max(64).optional(),
  newVerifier: verifier,
  kdf: phraseKdfSchema,
  wrappedKey: wrappedBlob,
});

const legacyPatch = z.object({
  currentPin: z.string().max(64).optional(),
  newPin: z.string().regex(/^\d{4,12}$/, "Le code doit faire 4 à 12 chiffres."),
  salt: b64,
  wrappedKey: z.string().max(4096),
  wrappedKeyIv: z.string().max(64),
});

async function session() {
  const s = await auth();
  return s?.user?.id && s.level === "full" ? s.user.id : null;
}

const select = { vaultPin: true, vaultSalt: true, vaultKeyWrapped: true, vaultKeyIv: true, vaultKdf: true } as const;

export async function GET() {
  const userId = await session();
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  const user = await prisma.user.findUnique({ where: { id: userId }, select });
  return NextResponse.json({
    hasPin: Boolean(user?.vaultPin),
    // The KDF parameters are needed BEFORE verification (to stretch the PIN); they aren't secret.
    kdf: user?.vaultKdf ?? null,
    // The wrapped key itself is only released by POST, after the PIN is verified.
    ...(user?.vaultKdf ? {} : { salt: user?.vaultSalt ?? null }),
  });
}

export async function PATCH(req: NextRequest) {
  const userId = await session();
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const rl = await rateLimit(`vaultpin:patch:${userId}`, 10, 10 * 60);
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });

  const raw = await req.json().catch(() => null);
  const user = await prisma.user.findUnique({ where: { id: userId }, select });

  // ── v2 ──────────────────────────────────────────────────────────────────────
  if (raw && typeof raw === "object" && "newVerifier" in raw) {
    const p = v2Patch.safeParse(raw);
    if (!p.success) return NextResponse.json({ error: "Requête invalide." }, { status: 400 });
    if (user?.vaultPin) {
      const ok = user.vaultKdf
        ? p.data.currentVerifier !== undefined && (await bcrypt.compare(p.data.currentVerifier, user.vaultPin))
        : p.data.currentPin !== undefined && (await bcrypt.compare(p.data.currentPin, user.vaultPin));
      if (!ok) return NextResponse.json({ error: "Code actuel incorrect." }, { status: 400 });
    }
    await prisma.user.update({
      where: { id: userId },
      data: {
        vaultPin: await bcrypt.hash(p.data.newVerifier, 10),
        vaultKdf: p.data.kdf,
        vaultKeyWrapped: p.data.wrappedKey,
        vaultKeyIv: null,
        vaultSalt: null,
      },
    });
    return NextResponse.json({ ok: true });
  }

  // ── legacy ──────────────────────────────────────────────────────────────────
  const p = legacyPatch.safeParse(raw);
  if (!p.success) return NextResponse.json({ error: p.error.issues[0]?.message ?? "Requête invalide." }, { status: 400 });
  if (user?.vaultKdf) return NextResponse.json({ error: "Ce coffre utilise le nouveau format." }, { status: 409 });
  if (user?.vaultPin && (!p.data.currentPin || !(await bcrypt.compare(p.data.currentPin, user.vaultPin)))) {
    return NextResponse.json({ error: "Code actuel incorrect." }, { status: 400 });
  }
  await prisma.user.update({
    where: { id: userId },
    data: {
      vaultPin: await bcrypt.hash(p.data.newPin, 10),
      vaultSalt: p.data.salt,
      vaultKeyWrapped: p.data.wrappedKey,
      vaultKeyIv: p.data.wrappedKeyIv,
      vaultKdf: Prisma.DbNull,
    },
  });
  return NextResponse.json({ ok: true, salt: p.data.salt, wrappedKey: p.data.wrappedKey, wrappedKeyIv: p.data.wrappedKeyIv });
}

export async function POST(req: NextRequest) {
  const userId = await session();
  if (!userId) return NextResponse.json({ error: "Non authentifié." }, { status: 401 });

  const rl = await rateLimit(`vaultpin:verify:${userId}`, 10, 10 * 60);
  if (!rl.ok) return NextResponse.json({ ok: false, error: "Trop de tentatives, réessaie plus tard." }, { status: 429 });

  const body = (await req.json().catch(() => ({}))) as { pin?: string; verifier?: string };
  const user = await prisma.user.findUnique({ where: { id: userId }, select });
  if (!user?.vaultPin) return NextResponse.json({ ok: false });

  if (user.vaultKdf) {
    // v2: only a verifier is accepted — a plain PIN sent to a v2 vault is refused, never compared.
    if (!body.verifier || !verifier.safeParse(body.verifier).success || !(await bcrypt.compare(body.verifier, user.vaultPin))) {
      return NextResponse.json({ ok: false });
    }
    return NextResponse.json({ ok: true, kdf: user.vaultKdf, wrappedKey: user.vaultKeyWrapped });
  }

  if (!body.pin || !(await bcrypt.compare(body.pin, user.vaultPin))) return NextResponse.json({ ok: false, salt: null });
  return NextResponse.json({
    ok: true,
    salt: user.vaultSalt,
    wrappedKey: user.vaultKeyWrapped,
    wrappedKeyIv: user.vaultKeyIv,
  });
}
