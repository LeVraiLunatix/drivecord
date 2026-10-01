/** GET /api/embed/origins?client_id= — origins allowed to frame this app's embeds (public: it is what the CSP says anyway). */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("client_id") ?? "";
  const app = /^app_[A-Za-z0-9_-]{8,64}$/.test(id) ? await prisma.app.findFirst({ where: { id, revokedAt: null }, select: { allowedOrigins: true, name: true } }) : null;
  return NextResponse.json({ origins: app?.allowedOrigins ?? [], name: app?.name ?? null }, { headers: { "Cache-Control": "public, max-age=30" } });
}
