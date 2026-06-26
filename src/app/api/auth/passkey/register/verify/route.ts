/**
 * POST /api/auth/passkey/register/verify   body: { response, name? }
 *
 * Verifies the attestation against the stashed challenge and persists the new
 * authenticator for the current account.
 */
import { NextRequest, NextResponse } from "next/server";
import { verifyRegistrationResponse } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import type { RegistrationResponseJSON } from "@simplewebauthn/types";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getRpID, getOrigin } from "@/lib/auth/webauthn";
import { unpackChallenge, REG_CHALLENGE_COOKIE } from "@/lib/auth/challenge-cookie";
import { deviceLabel } from "@/lib/auth/device";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (session.level !== "full") {
    return NextResponse.json({ error: "Session non vérifiée." }, { status: 403 });
  }
  const userId = session.user.id;

  const body = (await req.json().catch(() => ({}))) as {
    response?: RegistrationResponseJSON;
    name?: string;
  };
  if (!body.response) {
    return NextResponse.json({ error: "Réponse manquante." }, { status: 400 });
  }

  const expectedChallenge = unpackChallenge(
    req.cookies.get(REG_CHALLENGE_COOKIE)?.value,
  );
  if (!expectedChallenge) {
    return NextResponse.json(
      { error: "Défi expiré — recommence." },
      { status: 400 },
    );
  }

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response: body.response,
      expectedChallenge,
      expectedOrigin: getOrigin(req),
      expectedRPID: getRpID(req),
      requireUserVerification: false,
    });
  } catch (err) {
    console.error("[passkey/register/verify]", err);
    return NextResponse.json({ error: "Vérification échouée." }, { status: 400 });
  }

  if (!verification.verified || !verification.registrationInfo) {
    return NextResponse.json({ error: "Passkey non vérifié." }, { status: 400 });
  }

  const info = verification.registrationInfo;
  const credentialId = isoBase64URL.fromBuffer(info.credentialID);

  // Guard against re-registering the same credential.
  const dupe = await prisma.authenticator.findUnique({ where: { credentialId } });
  if (dupe) {
    return NextResponse.json(
      { error: "Ce passkey est déjà enregistré." },
      { status: 409 },
    );
  }

  const name =
    body.name?.trim() ||
    deviceLabel(req.headers.get("user-agent"));

  const created = await prisma.authenticator.create({
    data: {
      userId,
      credentialId,
      publicKey: Buffer.from(info.credentialPublicKey),
      counter: BigInt(info.counter),
      transports: body.response.response.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      name,
    },
    select: { id: true, name: true, createdAt: true },
  });

  const res = NextResponse.json({ ok: true, passkey: created });
  res.cookies.delete(REG_CHALLENGE_COOKIE);
  return res;
}
