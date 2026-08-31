/**
 * POST /api/auth/desktop-token
 *
 * Called first-party from `drivecord.app/login?desktop=1` right after a
 * successful login, by the Tauri desktop shell. Returns a long-lived NextAuth
 * session JWT (same shape/secret/salt as the session cookie) which the shell
 * stores in the OS keychain and then sends as `Authorization: Bearer …` on
 * every cross-origin API call. `src/proxy.ts` turns that header back into the
 * session cookie so existing routes need no changes.
 */
import { NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

const MAX_AGE = 30 * 24 * 60 * 60; // 30 days
// The desktop shell always talks to the https deployment.
const COOKIE_NAME = "__Secure-authjs.session-token";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  // DB is authoritative for name/avatar (the session JWT can lag behind).
  const dbUser = await prisma.user
    .findUnique({
      where: { id: session.user.id },
      select: { name: true, image: true },
    })
    .catch(() => null);

  const token = await encode({
    token: {
      sub: session.user.id,
      id: session.user.id,
      name: dbUser?.name ?? session.user.name,
      email: session.user.email,
      picture: dbUser?.image ?? session.user.image,
      level: "full",
    },
    secret: process.env.AUTH_SECRET!,
    salt: COOKIE_NAME,
    maxAge: MAX_AGE,
  });

  return NextResponse.json({ token, expiresIn: MAX_AGE });
}
