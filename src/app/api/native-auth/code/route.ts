/**
 * GET /api/native-auth/code?n=NONCE
 *
 * Called from the system browser AFTER the user finished OAuth there (so a
 * normal session cookie exists in the browser). Mints a one-time handoff code
 * for the logged-in user, which the app exchanges for its own session. `n` is
 * the nonce the app generated when it opened Safari: the code is bound to it.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { isNativeNonce, mintNativeCode } from "@/lib/auth/native-code";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const nonce = req.nextUrl.searchParams.get("n");
  if (!isNativeNonce(nonce)) {
    return NextResponse.json({ error: "Relance la connexion depuis l'app." }, { status: 400 });
  }
  return NextResponse.json({ code: mintNativeCode(session.user.id, nonce) });
}
