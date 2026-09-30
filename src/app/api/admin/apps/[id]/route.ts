/** PATCH /api/admin/apps/[id] — admin only: mark an app as verified (badge on the consent screen). */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin";
import { isResponse, readBody } from "@/lib/e2ee-server";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const b = await readBody(req, z.object({ verified: z.boolean() }));
  if (isResponse(b)) return b;
  const { id } = await params;
  const { count } = await prisma.app.updateMany({ where: { id }, data: { verified: b.verified } });
  return count ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "Application introuvable." }, { status: 404 });
}
