/**
 * GET  /api/developers/apps — the signed-in developer's apps (+ how many users connected each)
 * POST /api/developers/apps — register an app. `confidential: true` also returns a client secret, ONCE.
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isResponse, readBody, requireUser } from "@/lib/e2ee-server";
import { generateAppId, generateToken } from "@/lib/oauth/core";
import { MAX_APPS_PER_USER, createAppSchema } from "@/lib/oauth/apps";

export const runtime = "nodejs";

export const appView = (a: {
  id: string; name: string; iconUrl: string | null; homepageUrl: string; redirectUris: string[];
  allowedOrigins: string[]; clientSecretHash: string | null; verified: boolean; createdAt: Date; revokedAt: Date | null;
}) => ({
  id: a.id, name: a.name, iconUrl: a.iconUrl, homepageUrl: a.homepageUrl, redirectUris: a.redirectUris,
  allowedOrigins: a.allowedOrigins, confidential: Boolean(a.clientSecretHash), verified: a.verified,
  createdAt: a.createdAt, revokedAt: a.revokedAt,
});

export async function GET() {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const apps = await prisma.app.findMany({ where: { ownerUserId: u.userId, revokedAt: null }, orderBy: { createdAt: "desc" } });
  const counts = await prisma.appGrant.groupBy({ by: ["appId"], where: { appId: { in: apps.map((a) => a.id) }, revokedAt: null }, _count: { _all: true } });
  return NextResponse.json({
    apps: apps.map((a) => ({ ...appView(a), connectedUsers: counts.find((c) => c.appId === a.id)?._count._all ?? 0 })),
  });
}

export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const b = await readBody(req, createAppSchema);
  if (isResponse(b)) return b;
  if ((await prisma.app.count({ where: { ownerUserId: u.userId, revokedAt: null } })) >= MAX_APPS_PER_USER) {
    return NextResponse.json({ error: `Limite de ${MAX_APPS_PER_USER} applications atteinte.` }, { status: 409 });
  }
  const secret = b.confidential ? generateToken("cs") : null;
  const app = await prisma.app.create({
    data: {
      id: generateAppId(), ownerUserId: u.userId, name: b.name, homepageUrl: b.homepageUrl, iconUrl: b.iconUrl ?? null,
      redirectUris: [...new Set(b.redirectUris)], allowedOrigins: [...new Set(b.allowedOrigins)], clientSecretHash: secret?.hash ?? null,
    },
  });
  return NextResponse.json({ app: appView(app), clientSecret: secret?.raw ?? null }, { status: 201 });
}
