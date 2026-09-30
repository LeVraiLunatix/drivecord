/**
 * GET /api/admin/reports — open abuse reports on public links (admin only),
 * grouped by link with the file they point at.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth/admin";

export const runtime = "nodejs";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Accès refusé." }, { status: 403 });

  const reports = await prisma.linkReport.findMany({
    where: { handledAt: null },
    orderBy: { createdAt: "desc" },
    take: 500,
  });
  const tokens = [...new Set(reports.map((r) => r.token))];
  const shares = await prisma.share.findMany({ where: { token: { in: tokens } } });
  const files = await prisma.driveFile.findMany({
    where: { id: { in: shares.map((s) => s.fileId) } },
    select: { id: true, filename: true, mimeType: true, size: true },
  });

  const items = tokens.map((token) => {
    const share = shares.find((s) => s.token === token);
    const file = files.find((f) => f.id === share?.fileId);
    const mine = reports.filter((r) => r.token === token);
    return {
      token,
      disabled: Boolean(share?.disabledAt),
      filename: file?.filename ?? null,
      mimeType: file?.mimeType ?? null,
      size: file?.size ?? null,
      count: mine.length,
      lastReportAt: mine[0]!.createdAt,
      reasons: mine.slice(0, 5).map((r) => r.reason),
    };
  });
  return NextResponse.json({ reports: items });
}
