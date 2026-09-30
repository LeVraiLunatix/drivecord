/**
 * PATCH  /api/developers/apps/[id] — edit name / URLs / redirect URIs / origins
 * DELETE /api/developers/apps/[id] — disable the app: every grant's tokens stop working at once
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isResponse, readBody, requireUser } from "@/lib/e2ee-server";
import { updateAppSchema } from "@/lib/oauth/apps";
import { appView } from "../route";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { id } = await params;
  const b = await readBody(req, updateAppSchema);
  if (isResponse(b)) return b;
  const { count } = await prisma.app.updateMany({
    where: { id, ownerUserId: u.userId, revokedAt: null },
    data: {
      ...(b.name !== undefined ? { name: b.name } : {}),
      ...(b.homepageUrl !== undefined ? { homepageUrl: b.homepageUrl } : {}),
      ...(b.iconUrl !== undefined ? { iconUrl: b.iconUrl } : {}),
      ...(b.redirectUris ? { redirectUris: [...new Set(b.redirectUris)] } : {}),
      ...(b.allowedOrigins ? { allowedOrigins: [...new Set(b.allowedOrigins)] } : {}),
    },
  });
  if (count === 0) return NextResponse.json({ error: "Application introuvable." }, { status: 404 });
  return NextResponse.json({ app: appView((await prisma.app.findUnique({ where: { id } }))!) });
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { id } = await params;
  const { count } = await prisma.app.updateMany({ where: { id, ownerUserId: u.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count === 0) return NextResponse.json({ error: "Application introuvable." }, { status: 404 });
  await prisma.oAuthToken.updateMany({ where: { appId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  return new NextResponse(null, { status: 204 });
}
