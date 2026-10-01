/** GET /api/account/apps — the apps this user has connected ("Applications connectées"). */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isResponse, requireUser } from "@/lib/e2ee-server";

export const runtime = "nodejs";

export async function GET() {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const grants = await prisma.appGrant.findMany({
    where: { userId: u.userId, revokedAt: null, app: { revokedAt: null } },
    include: { app: { select: { name: true, iconUrl: true, homepageUrl: true, verified: true } }, webhook: { select: { driveId: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });
  const last = await prisma.oAuthToken.groupBy({ by: ["grantId"], where: { grantId: { in: grants.map((g) => g.id) } }, _max: { createdAt: true } });
  return NextResponse.json({
    grants: grants.map((g) => ({
      id: g.id, app: g.app, driveId: g.webhook.driveId, driveName: g.webhook.name, appFolderId: g.appFolderId,
      scopes: g.scopes, createdAt: g.createdAt, lastActivityAt: last.find((l) => l.grantId === g.id)?._max.createdAt ?? null,
    })),
  });
}
