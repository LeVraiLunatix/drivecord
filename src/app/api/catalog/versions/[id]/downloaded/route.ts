/**
 * POST /api/catalog/versions/[id]/downloaded — Quarry calls this once an installation succeeded and
 * its hash was verified. One count per IP and version per hour: it is a popularity hint, not a ledger.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-v2/errors";
import { parseId } from "@/lib/api-v2/validate";
import { rateLimit } from "@/lib/rate-limit";
import { catalogPreflight, publicRoute } from "@/lib/catalog/http";

export const runtime = "nodejs";
export const OPTIONS = catalogPreflight("POST, OPTIONS");
type P = { id: string };

export const POST = publicRoute<P>(async ({ params, ip }) => {
  const id = parseId(params.id);
  const version = await prisma.catalogVersion.findFirst({
    where: { id, status: "published", project: { status: "published" } },
    select: { id: true, projectId: true },
  });
  if (!version) throw new ApiError(404, "not_found", "Version introuvable.");

  const once = await rateLimit(`catalog:downloaded:${ip}:${version.id}`, 1, 3600);
  if (once.ok) {
    await prisma.$transaction([
      prisma.catalogVersion.update({ where: { id: version.id }, data: { downloads: { increment: 1 } } }),
      prisma.catalogProject.update({ where: { id: version.projectId }, data: { downloads: { increment: 1 } } }),
    ]);
  }
  return new NextResponse(null, { status: 204 });
});
