/**
 * DELETE /api/settings/api-keys/[id] — revoke an API key.
 *
 * The first call revokes (the key stays listed, marked revoked, and is refused
 * everywhere at once). Calling it again on a revoked key removes the row.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;

  const { count } = await prisma.apiKey.updateMany({
    where: { id, userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) await prisma.apiKey.deleteMany({ where: { id, userId, NOT: { revokedAt: null } } });
  return new NextResponse(null, { status: 204 });
}
