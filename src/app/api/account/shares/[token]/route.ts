/**
 * DELETE /api/account/shares/[token] — revoke a share link (owner only).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const { token } = await params;

  const share = await prisma.share.findUnique({
    where: { token },
    include: { webhook: { select: { userId: true } } },
  });
  if (!share || share.webhook.userId !== session.user.id) {
    return NextResponse.json({ error: "Introuvable." }, { status: 404 });
  }

  await prisma.share.delete({ where: { token } });
  return new NextResponse(null, { status: 204 });
}
