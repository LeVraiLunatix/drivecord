/**
 * GET /api/native-auth/code
 *
 * Called from the system browser AFTER the user finished OAuth there (so a
 * normal session cookie exists in the browser). Mints a one-time handoff code
 * for the logged-in user, which the app exchanges for its own session.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { mintNativeCode } from "@/lib/auth/native-code";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  return NextResponse.json({ code: mintNativeCode(session.user.id) });
}
