/** POST /api/developers/apps/[id]/secret — new client secret (shown ONCE); the old one stops working at once. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isResponse, requireUser } from "@/lib/e2ee-server";
import { generateToken } from "@/lib/oauth/core";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { id } = await params;
  const secret = generateToken("cs");
  const { count } = await prisma.app.updateMany({ where: { id, ownerUserId: u.userId, revokedAt: null }, data: { clientSecretHash: secret.hash } });
  if (count === 0) return NextResponse.json({ error: "Application introuvable." }, { status: 404 });
  return NextResponse.json({ clientSecret: secret.raw });
}
