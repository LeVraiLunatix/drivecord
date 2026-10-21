/**
 * POST /api/e2ee/pin — release the PIN-wrapped Master Key against a proof.
 *
 * Body `{ pinAuth }`: HKDF(Argon2id(PIN)), computed on the device (see lib/crypto/e2ee/pin.ts).
 * The server only keeps SHA-256(pinAuth). A wrong proof counts as a failed try; at
 * PIN_MAX_ATTEMPTS the PIN is wiped, so a stolen session can't grind through the 10^6 PINs.
 */
import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { isResponse, readBody, requireUser } from "@/lib/e2ee-server";
import { PIN_MAX_ATTEMPTS } from "@/lib/crypto/e2ee/pin-policy";

export const runtime = "nodejs";

const schema = z.object({ pinAuth: z.string().regex(/^[A-Za-z0-9+/]{43}=$/) });

export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const l = await rateLimit(`e2ee:pin:${u.userId}`, 12, 600);
  if (!l.ok) return NextResponse.json({ error: "Trop d'essais. Réessaie dans quelques minutes." }, { status: 429, headers: { "Retry-After": String(l.retryAfterSec) } });
  const body = await readBody(req, schema, 1024);
  if (isResponse(body)) return body;

  const keys = await prisma.userKeys.findUnique({
    where: { userId: u.userId },
    select: { mkWrappedPin: true, pinVerifier: true, pinFails: true },
  });
  if (!keys?.mkWrappedPin || !keys.pinVerifier) return NextResponse.json({ error: "Aucun PIN n'est configuré." }, { status: 404 });

  const given = createHash("sha256").update(body.pinAuth).digest();
  const stored = Buffer.from(keys.pinVerifier, "base64");
  if (given.length === stored.length && timingSafeEqual(given, stored)) {
    if (keys.pinFails > 0) await prisma.userKeys.update({ where: { userId: u.userId }, data: { pinFails: 0 } });
    return NextResponse.json({ mkWrappedPin: keys.mkWrappedPin });
  }

  // Atomic increment, so parallel guesses can't dodge the counter.
  const { pinFails } = await prisma.userKeys.update({ where: { userId: u.userId }, data: { pinFails: { increment: 1 } }, select: { pinFails: true } });
  if (pinFails >= PIN_MAX_ATTEMPTS) {
    await prisma.userKeys.update({
      where: { userId: u.userId },
      data: { mkWrappedPin: null, pinKdf: Prisma.DbNull, pinVerifier: null, pinFails: 0 },
    });
    return NextResponse.json({ error: "Trop d'essais : le PIN a été désactivé. Utilise une autre méthode.", attemptsLeft: 0 }, { status: 423 });
  }
  const attemptsLeft = PIN_MAX_ATTEMPTS - pinFails;
  return NextResponse.json({ error: `PIN incorrect. ${attemptsLeft} essai${attemptsLeft > 1 ? "s" : ""} restant${attemptsLeft > 1 ? "s" : ""}.`, attemptsLeft }, { status: 403 });
}
