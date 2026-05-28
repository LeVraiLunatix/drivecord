/**
 * /api/webhooks/[id] — delete a specific webhook for the current user.
 *
 * DELETE /api/webhooks/:driveId
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id: driveId } = await params;

  await prisma.webhook.deleteMany({
    where: { userId: session.user.id, driveId },
  });

  return new NextResponse(null, { status: 204 });
}
