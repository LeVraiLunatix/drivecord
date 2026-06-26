/**
 * POST /api/auth/passkey/register/options
 *
 * Returns PublicKeyCredentialCreationOptions for adding a passkey to the current
 * (fully-authenticated) account. The challenge is stashed in a signed httpOnly
 * cookie for the verify step.
 */
import { NextRequest, NextResponse } from "next/server";
import { generateRegistrationOptions } from "@simplewebauthn/server";
import { isoBase64URL } from "@simplewebauthn/server/helpers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getRpID, getRpName } from "@/lib/auth/webauthn";
import {
  packChallenge,
  REG_CHALLENGE_COOKIE,
  challengeCookieOptions,
} from "@/lib/auth/challenge-cookie";
import { isSecureRequest } from "@/lib/auth/session-token";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (session.level !== "full") {
    return NextResponse.json(
      { error: "Termine d'abord la vérification de connexion." },
      { status: 403 },
    );
  }
  const userId = session.user.id;

  const existing = await prisma.authenticator.findMany({
    where: { userId },
    select: { credentialId: true },
  });

  const options = await generateRegistrationOptions({
    rpName: getRpName(),
    rpID: getRpID(req),
    userID: userId,
    userName: session.user.email,
    userDisplayName: session.user.name ?? session.user.email,
    attestationType: "none",
    excludeCredentials: existing.map((a) => ({
      id: isoBase64URL.toBuffer(a.credentialId),
      type: "public-key" as const,
    })),
    authenticatorSelection: {
      residentKey: "preferred",
      userVerification: "preferred",
    },
  });

  const secure = isSecureRequest(req);
  const res = NextResponse.json(options);
  res.cookies.set(
    REG_CHALLENGE_COOKIE,
    packChallenge(options.challenge),
    challengeCookieOptions(secure),
  );
  return res;
}
