/**
 * POST /api/auth/passkey/login/verify   body: AuthenticationResponseJSON
 *
 * Verifies the assertion, updates the signature counter (replay protection),
 * and opens a session via finalizeLogin (which applies the step-up level).
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyAuthenticationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { AuthenticationResponseJSON } from "@simplewebauthn/types";
import { prisma } from "@/lib/prisma";
import { getRpID, getOrigin } from "@/lib/auth/webauthn";
import { unpackChallenge, AUTH_CHALLENGE_COOKIE } from "@/lib/auth/challenge-cookie";
import { finalizeLogin } from "@/lib/auth/login";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`passkey:login:ip:${ip}`, 20, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Trop de tentatives. Réessaie plus tard." },
      { status: 429 },
    );
  }

  const asseResp = (await req.json().catch(() => null)) as AuthenticationResponseJSON | null;
  if (!asseResp?.id) {
    return NextResponse.json({ error: "Réponse invalide." }, { status: 400 });
  }

  const expectedChallenge = unpackChallenge(
    req.cookies.get(AUTH_CHALLENGE_COOKIE)?.value,
  );
  if (!expectedChallenge) {
    return NextResponse.json({ error: "Défi expiré — recommence." }, { status: 400 });
  }

  const authenticator = await prisma.authenticator.findUnique({
    where: { credentialId: asseResp.id },
    include: { user: true },
  });
  if (!authenticator) {
    return NextResponse.json({ error: "Passkey inconnu." }, { status: 400 });
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response: asseResp,
      expectedChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpID(req),
      authenticator: {
        credentialID: isoBase64URL.toBuffer(authenticator.credentialId),
        credentialPublicKey: new Uint8Array(authenticator.publicKey),
        counter: Number(authenticator.counter),
      },
      requireUserVerification: false,
    });
  } catch (err) {
    console.error("[passkey/login/verify]", err);
    return NextResponse.json({ error: "Vérification échouée." }, { status: 400 });
  }

  if (!verification.verified) {
    return NextResponse.json({ error: "Passkey non vérifié." }, { status: 400 });
  }

  await prisma.authenticator.update({
    where: { id: authenticator.id },
    data: {
      counter: BigInt(verification.authenticationInfo.newCounter),
      lastUsedAt: new Date(),
    },
  });

  const res = NextResponse.json({ ok: true });
  await finalizeLogin(req, res, {
    id: authenticator.user.id,
    name: authenticator.user.name,
    email: authenticator.user.email,
    image: authenticator.user.image,
  });
  res.cookies.delete(AUTH_CHALLENGE_COOKIE);
  // The client navigates to /drive; the proxy redirects to /auth/challenge if
  // the resolved level is still pending (e.g. 24h re-verification).
  return res;
}
