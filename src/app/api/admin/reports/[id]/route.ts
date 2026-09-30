/**
 * PATCH /api/admin/reports/[token] — handle the reports of one link (admin only).
 * Body: { action: "disable" | "dismiss" }
 *   disable → the link stops serving anything (410) and its reports are closed
 *   dismiss → close the reports, leave the link alone
 * (The route param is named `id` for Next's sake; it is the share token.)
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

const bodySchema = z.object({ action: z.enum(["disable", "dismiss"]) });

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  const { id: token } = await params;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Action invalide." }, { status: 400 });

  const now = new Date();
  if (parsed.data.action === "disable") {
    const { count } = await prisma.share.updateMany({ where: { token }, data: { disabledAt: now } });
    if (count === 0) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });
  }
  await prisma.linkReport.updateMany({ where: { token, handledAt: null }, data: { handledAt: now } });
  return NextResponse.json({ ok: true });
}
