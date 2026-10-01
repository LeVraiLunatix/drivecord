/** DELETE — first call revokes (kept listed, refused everywhere); a second call removes the row. */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isResponse, requireUser } from "@/lib/e2ee-server";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { id } = await params;
  const { count } = await prisma.personalToken.updateMany({ where: { id, userId: u.userId, revokedAt: null }, data: { revokedAt: new Date() } });
  if (count === 0) await prisma.personalToken.deleteMany({ where: { id, userId: u.userId, NOT: { revokedAt: null } } });
  return new NextResponse(null, { status: 204 });
}
