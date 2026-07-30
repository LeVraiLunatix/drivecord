/**
 * Gestion des annonces (admin uniquement — vérifié côté serveur via requireAdmin).
 *
 *  GET    → l'annonce la plus récente (pour préremplir le formulaire admin).
 *  POST   → crée/publie une annonce { title, body, important, durationMs, linkUrl?, linkLabel? }.
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
  try {
    const announcement = await prisma.announcement.findFirst({
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ announcement });
  } catch (err) {
    console.error("[admin/announcement:GET]", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur." },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const { title, body, important, durationMs, linkUrl, linkLabel } = (await req.json()) as {
    title?: string;
    body?: string;
    important?: boolean;
    durationMs?: number;
    linkUrl?: string;
    linkLabel?: string;
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
  const trimmedLinkUrl = linkUrl?.trim() || null;
  const trimmedLinkLabel = linkLabel?.trim() || null;
  if (trimmedLinkUrl && !trimmedLinkLabel) {
    return NextResponse.json(
      { error: "Le libellé du bouton est requis si un lien est renseigné." },
      { status: 400 },
    );
  }

  try {
    const announcement = await prisma.announcement.create({
      data: {
        title: title.trim().slice(0, 120),
        body: body.trim().slice(0, 2000),
        important: Boolean(important),
        expiresAt: new Date(Date.now() + ms),
        linkUrl: trimmedLinkUrl?.slice(0, 500),
        linkLabel: trimmedLinkLabel?.slice(0, 60),
      },
    });
    return NextResponse.json({ announcement }, { status: 201 });
  } catch (err) {
    console.error("[admin/announcement:POST]", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur." },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  const session = await requireAdmin();
  if (!session) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }
  try {
    await prisma.announcement.updateMany({
      where: { expiresAt: { gt: new Date() } },
      data: { expiresAt: new Date() },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[admin/announcement:DELETE]", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur." },
      { status: 500 },
    );
  }
}
