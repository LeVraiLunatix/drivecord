/**
 * GET /api/announcement — annonce active à afficher en popup (publique).
 *
 * Renvoie la dernière annonce dont la date d'expiration n'est pas dépassée, ou
 * null. Aucune authentification requise (le site la montre à tous les visiteurs).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const announcement = await prisma.announcement.findFirst({
      where: { expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, title: true, body: true, important: true, linkUrl: true, linkLabel: true },
    });

    return NextResponse.json(
      { announcement },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[announcement:GET]", err);
    return NextResponse.json(
      { error: "Erreur interne du serveur." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
