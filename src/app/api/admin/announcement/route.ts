/**
 * Gestion des annonces (admin uniquement — vérifié côté serveur via requireAdmin).
 *
 *  GET    → l'annonce la plus récente (pour préremplir le formulaire admin).
 *  POST   → crée/publie une annonce { title, body, important, durationMs }.
 *           expiresAt = maintenant + durationMs.
 *  DELETE → désactive toutes les annonces actives (expiresAt = maintenant).
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin";

const MAX_DURATION_MS = 365 * 24 * 60 * 60 * 1000; // 1 an

export async function GET() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  const announcement = await prisma.announcement.findFirst({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ announcement });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { title, body, important, durationMs } = (await req.json()) as {
    title?: string;
    body?: string;
    important?: boolean;
    durationMs?: number;
  };

  if (!title?.trim() || !body?.trim()) {
    return NextResponse.json(
      { error: "Titre et description requis." },
      { status: 400 },
    );
  }
  const ms = Number(durationMs);
  if (!Number.isFinite(ms) || ms <= 0 || ms > MAX_DURATION_MS) {
    return NextResponse.json({ error: "Durée invalide." }, { status: 400 });
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: title.trim().slice(0, 120),
      body: body.trim().slice(0, 2000),
      important: Boolean(important),
      expiresAt: new Date(Date.now() + ms),
    },
  });

  return NextResponse.json({ announcement }, { status: 201 });
}

export async function DELETE() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  await prisma.announcement.updateMany({
    where: { expiresAt: { gt: new Date() } },
    data: { expiresAt: new Date() },
  });
  return NextResponse.json({ ok: true });
}
