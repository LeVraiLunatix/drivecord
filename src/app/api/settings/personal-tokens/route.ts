/**
 * GET  /api/settings/personal-tokens — the user's API v2 personal tokens (never the secret)
 * POST /api/settings/personal-tokens — { driveId, name, scopes?, expiresInDays?, allowedOrigins? } → raw token ONCE
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isResponse, readBody, requireUser } from "@/lib/e2ee-server";
import { expiryFromDays } from "@/lib/auth/api-key";
import { generatePat, sanitizeAllowedOrigins, sanitizePatScopes } from "@/lib/auth/personal-token";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const rows = await prisma.personalToken.findMany({
    where: { userId: u.userId },
    include: { webhook: { select: { name: true, driveId: true } } },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({
    tokens: rows.map((t) => ({
      id: t.id, name: t.name, prefix: t.keyPrefix, scopes: t.scopes, driveId: t.webhook.driveId, driveName: t.webhook.name,
      allowedOrigins: t.allowedOrigins, expiresAt: t.expiresAt, revokedAt: t.revokedAt, lastUsedAt: t.lastUsedAt, createdAt: t.createdAt,
    })),
  });
}

const schema = z.object({
  driveId: z.string().max(128),
  name: z.string().trim().min(1).max(80),
  scopes: z.array(z.string()).optional(),
  expiresInDays: z.number().nullable().optional(),
  allowedOrigins: z.array(z.string()).max(10).optional(),
});

export async function POST(req: NextRequest) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const b = await readBody(req, schema);
  if (isResponse(b)) return b;
  const expiresAt = expiryFromDays(b.expiresInDays);
  if (expiresAt === null) return NextResponse.json({ error: "Durée de validité invalide (1 à 365 jours)." }, { status: 400 });
  const origins = sanitizeAllowedOrigins(b.allowedOrigins);
  if (origins === null) return NextResponse.json({ error: "Origines invalides." }, { status: 400 });
  const webhook = await prisma.webhook.findFirst({ where: { driveId: b.driveId, userId: u.userId } });
  if (!webhook) return NextResponse.json({ error: "Drive introuvable." }, { status: 404 });
  if ((await prisma.personalToken.count({ where: { userId: u.userId, revokedAt: null } })) >= 20) {
    return NextResponse.json({ error: "Trop de jetons actifs (20 maximum)." }, { status: 409 });
  }
  const t = generatePat();
  const row = await prisma.personalToken.create({
    data: { userId: u.userId, webhookId: webhook.id, name: b.name, keyPrefix: t.prefix, keyHash: t.hash, scopes: sanitizePatScopes(b.scopes), allowedOrigins: origins, expiresAt: expiresAt ?? null },
  });
  return NextResponse.json({ id: row.id, token: t.raw, name: row.name, scopes: row.scopes, expiresAt: row.expiresAt }, { status: 201 });
}
