/**
 * POST /api/embed/session { ticket } — trades a single-use ticket for a short session token that the
 * embed keeps IN MEMORY (never a cookie: a cookie would be ambient authority for the host site).
 * The token is a normal session JWT accepted through the `Authorization: Bearer` bridge in proxy.ts.
 */
import { NextRequest, NextResponse } from "next/server";
import { decode, encode } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isResponse, readBody } from "@/lib/e2ee-server";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/rate-limit";
import { TICKET_SALT } from "../ticket/route";

export const runtime = "nodejs";
const SESSION_TTL = 60 * 60; // 1 h — the embed asks for a new ticket afterwards
const COOKIE_NAME = "__Secure-authjs.session-token";

export async function POST(req: NextRequest) {
  const rl = await rateLimit(`embed:session:${getClientIp(req)}`, 30, 60);
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 });
  const b = await readBody(req, z.object({ ticket: z.string().max(4096) }));
  if (isResponse(b)) return b;
  const t = await decode({ token: b.ticket, secret: process.env.AUTH_SECRET!, salt: TICKET_SALT }).catch(() => null);
  const userId = typeof t?.sub === "string" ? t.sub : null;
  const clientId = typeof t?.aud === "string" ? t.aud : null;
  const jti = typeof t?.jti === "string" ? t.jti : null;
  if (!userId || !clientId || !jti) return NextResponse.json({ error: "Ticket invalide ou expiré." }, { status: 401 });
  // Single use: the first redeemer wins, a replay finds the counter already spent.
  const once = await rateLimit(`embed:ticket-used:${jti}`, 1, 120);
  if (!once.ok) return NextResponse.json({ error: "Ticket déjà utilisé." }, { status: 401 });

  const grant = await prisma.appGrant.findFirst({
    where: { appId: clientId, userId, revokedAt: null, app: { revokedAt: null } },
    include: { app: { select: { name: true } }, webhook: { select: { driveId: true } }, user: { select: { name: true, email: true, image: true } } },
  });
  if (!grant) return NextResponse.json({ error: "Application non autorisée." }, { status: 403 });

  const token = await encode({
    token: { sub: userId, id: userId, name: grant.user.name, email: grant.user.email, picture: grant.user.image, level: "full", embedFor: clientId },
    secret: process.env.AUTH_SECRET!,
    salt: COOKIE_NAME,
    maxAge: SESSION_TTL,
  });
  return NextResponse.json(
    { token, expiresIn: SESSION_TTL, userId, app: { id: clientId, name: grant.app.name }, grant: { driveId: grant.webhook.driveId, appFolderId: grant.appFolderId } },
    { headers: { "Cache-Control": "no-store" } },
  );
}
