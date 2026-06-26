/**
 * POST /api/auth/passkey/login/options
 *
 * Returns PublicKeyCredentialRequestOptions for a usernameless (discoverable)
 * passkey login. No session required. Challenge stashed in a signed cookie.
 */
import { NextRequest, NextResponse } from "next/server";
import { generateAuthenticationOptions } from "@simplewebauthn/server";
import { getRpID } from "@/lib/auth/webauthn";
import {
  packChallenge,
  AUTH_CHALLENGE_COOKIE,
  challengeCookieOptions,
} from "@/lib/auth/challenge-cookie";
import { isSecureRequest } from "@/lib/auth/session-token";

export async function POST(req: NextRequest) {
  const options = await generateAuthenticationOptions({
    rpID: getRpID(req),
    userVerification: "preferred",
    // No allowCredentials → the browser offers any discoverable passkey.
  });

  const secure = isSecureRequest(req);
  const res = NextResponse.json(options);
  res.cookies.set(
    AUTH_CHALLENGE_COOKIE,
    packChallenge(options.challenge),
    challengeCookieOptions(secure),
  );
  return res;
}
