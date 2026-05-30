/**
 * GET /api/native-auth/exchange?code=XXX
 *
 * Runs inside the APP's WebView. Validates the one-time handoff code, then
 * crafts a NextAuth (JWT-strategy) session token and sets it as the session
 * cookie — logging the user in inside the app — and redirects to /drive.
 */
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { prisma } from "@/lib/prisma";
import { verifyNativeCode } from "@/lib/auth/native-code";

const MAX_AGE = 30 * 24 * 60 * 60; // 30 days

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(new URL("/login?error=NativeAuth", req.url));
  }

  const userId = verifyNativeCode(code);
  if (!userId) {
    return NextResponse.redirect(new URL("/login?error=NativeAuthExpired", req.url));
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, image: true },
  });
  if (!user) {
    return NextResponse.redirect(new URL("/login?error=NativeAuth", req.url));
  }

  const secure = req.nextUrl.protocol === "https:";
  const cookieName = secure
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

  // Build the same token shape NextAuth's jwt callback produces.
  const token = await encode({
    token: {
      sub: user.id,
      id: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
    },
    secret: process.env.AUTH_SECRET!,
    salt: cookieName,
    maxAge: MAX_AGE,
  });

  const res = NextResponse.redirect(new URL("/drive", req.url));
  res.cookies.set(cookieName, token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE,
  });
  return res;
}
