/**
 * POST /api/embed/ticket { client_id } — first-party only (session cookie, from the /embed/connect popup).
 * Returns a 60-second, single-use ticket the framed embed trades for an in-memory session token.
 */
import { isSameOriginRequest } from "@/lib/same-origin";
import { NextRequest, NextResponse } from "next/server";
import { encode } from "next-auth/jwt";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isResponse, readBody, requireUser } from "@/lib/e2ee-server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const TICKET_SALT = "drivecord-embed-ticket";

export async function POST(req: NextRequest) {
  // CSRF: only our own pages (the popup) may mint a ticket.
  if (!isSameOriginRequest(req, true)) return NextResponse.json({ error: "Origine refusée." }, { status: 403 });
  const u = await requireUser();
  if (isResponse(u)) return u;
  const b = await readBody(req, z.object({ client_id: z.string().max(80) }));
  if (isResponse(b)) return b;
  const rl = await rateLimit(`embed:ticket:${u.userId}`, 20, 60);
  if (!rl.ok) return NextResponse.json({ error: "Trop de tentatives." }, { status: 429 });
  const grant = await prisma.appGrant.findFirst({ where: { appId: b.client_id, userId: u.userId, revokedAt: null, app: { revokedAt: null } }, select: { id: true } });
  if (!grant) return NextResponse.json({ error: "Application non autorisée : connecte-la d'abord." }, { status: 403 });
  const jti = crypto.randomUUID();
  const ticket = await encode({ token: { sub: u.userId, aud: b.client_id, jti }, secret: process.env.AUTH_SECRET!, salt: TICKET_SALT, maxAge: 60 });
  return NextResponse.json({ ticket }, { headers: { "Cache-Control": "no-store" } });
}
