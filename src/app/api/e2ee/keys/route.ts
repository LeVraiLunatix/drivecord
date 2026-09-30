/**
 * GET   /api/e2ee/keys — the user's wrapped key material + their passkey ids (for PRF unlock)
 * POST  /api/e2ee/keys — first-time setup (409 if keys already exist)
 * PATCH /api/e2ee/keys — add / replace / remove an unlock method, rotate the recovery blob,
 *                        store the wrapped vault key
 *
 * Everything here is opaque to the server: each blob is wrapped by a key only the
 * user's devices hold. Session-only (never reachable with an API key or app token).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { b64, isResponse, phraseKdfSchema, readBody, requireUser, wrappedBlob } from "@/lib/e2ee-server";

export const runtime = "nodejs";

const credentialId = z.string().regex(/^[A-Za-z0-9_-]{1,512}$/);

const createSchema = z.object({
  mkWrappedRecovery: wrappedBlob,
  mkWrappedPhrase: wrappedBlob.nullish(),
  phraseKdf: phraseKdfSchema.nullish(),
  mkWrappedPasskey: z.record(credentialId, wrappedBlob).default({}),
  publicKeyX25519: b64,
  privateKeyWrapped: wrappedBlob,
  vaultKeyWrapped: wrappedBlob.nullish(),
});

const patchSchema = z
  .object({
    mkWrappedRecovery: wrappedBlob,
    phrase: z.object({ mkWrappedPhrase: wrappedBlob, phraseKdf: phraseKdfSchema }).nullable(),
    setPasskey: z.object({ credentialId, mkWrapped: wrappedBlob }),
    removePasskey: credentialId,
    vaultKeyWrapped: wrappedBlob.nullable(),
  })
  .partial()
  .refine((b) => Object.keys(b).length > 0, "Aucun champ à modifier.");

async function limited(userId: string) {
  const r = await rateLimit(`e2ee:keys:${userId}`, 30, 60);
  return r.ok ? null : NextResponse.json({ error: "Trop de requêtes." }, { status: 429, headers: { "Retry-After": String(r.retryAfterSec) } });
}

const view = (k: NonNullable<Awaited<ReturnType<typeof prisma.userKeys.findUnique>>>) => ({
  version: k.version,
  mkWrappedRecovery: k.mkWrappedRecovery,
  mkWrappedPhrase: k.mkWrappedPhrase,
  phraseKdf: k.phraseKdf,
  mkWrappedPasskey: k.mkWrappedPasskey as Record<string, string>,
  publicKeyX25519: k.publicKeyX25519,
  privateKeyWrapped: k.privateKeyWrapped,
  vaultKeyWrapped: k.vaultKeyWrapped,
});

export async function GET() {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const [keys, passkeys] = await Promise.all([
    prisma.userKeys.findUnique({ where: { userId: u.userId } }),
    prisma.authenticator.findMany({ where: { userId: u.userId }, select: { credentialId: true, name: true } }),
  ]);
  return NextResponse.json({
    keys: keys ? view(keys) : null,
    passkeys: passkeys.map((p) => ({ credentialId: p.credentialId, name: p.name })),
  });
}

export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const l = await limited(u.userId);
  if (l) return l;
  const body = await readBody(req, createSchema);
  if (isResponse(body)) return body;

  if (await prisma.userKeys.findUnique({ where: { userId: u.userId }, select: { userId: true } })) {
    return NextResponse.json({ error: "Le chiffrement est déjà configuré pour ce compte." }, { status: 409 });
  }
  const row = await prisma.userKeys.create({
    data: {
      userId: u.userId,
      mkWrappedRecovery: body.mkWrappedRecovery,
      mkWrappedPhrase: body.mkWrappedPhrase ?? null,
      phraseKdf: body.phraseKdf ?? undefined,
      mkWrappedPasskey: body.mkWrappedPasskey,
      publicKeyX25519: body.publicKeyX25519,
      privateKeyWrapped: body.privateKeyWrapped,
      vaultKeyWrapped: body.vaultKeyWrapped ?? null,
    },
  });
  return NextResponse.json({ keys: view(row) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const l = await limited(u.userId);
  if (l) return l;
  const body = await readBody(req, patchSchema);
  if (isResponse(body)) return body;

  const current = await prisma.userKeys.findUnique({ where: { userId: u.userId } });
  if (!current) return NextResponse.json({ error: "Chiffrement non configuré." }, { status: 404 });

  const passkeys = { ...(current.mkWrappedPasskey as Record<string, string>) };
  if (body.setPasskey) passkeys[body.setPasskey.credentialId] = body.setPasskey.mkWrapped;
  if (body.removePasskey) delete passkeys[body.removePasskey];
  if (Object.keys(passkeys).length > 20) return NextResponse.json({ error: "Trop de passkeys." }, { status: 400 });

  const row = await prisma.userKeys.update({
    where: { userId: u.userId },
    data: {
      ...(body.mkWrappedRecovery ? { mkWrappedRecovery: body.mkWrappedRecovery } : {}),
      ...(body.phrase === null ? { mkWrappedPhrase: null, phraseKdf: Prisma.DbNull } : {}),
      ...(body.phrase ? { mkWrappedPhrase: body.phrase.mkWrappedPhrase, phraseKdf: body.phrase.phraseKdf } : {}),
      ...(body.setPasskey || body.removePasskey ? { mkWrappedPasskey: passkeys } : {}),
      ...(body.vaultKeyWrapped !== undefined ? { vaultKeyWrapped: body.vaultKeyWrapped } : {}),
    },
  });
  return NextResponse.json({ keys: view(row) });
}
