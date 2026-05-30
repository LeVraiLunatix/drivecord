/**
 * /api/webhooks/[id] — manage a specific webhook (drive) for the current user.
 *
 * PATCH  /api/webhooks/:driveId  → rename { name }
 * DELETE /api/webhooks/:driveId  → unlink
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const { id: driveId } = await params;
  const body = (await req.json()) as { name?: string };

  const data: Record<string, unknown> = { updatedAt: new Date() };
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) {
      return NextResponse.json({ error: "Nom requis." }, { status: 400 });
    }
    data.name = name.slice(0, 80);
  }

  await prisma.webhook.updateMany({
    where: { userId: session.user.id, driveId },
    data,
  });

  return NextResponse.json({ ok: true });
}

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
