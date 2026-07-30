/**
 * DELETE /api/settings/api-keys/[id] — revoke an API key.
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

  await prisma.apiKey.deleteMany({ where: { id, userId: session.user.id } });
  return new NextResponse(null, { status: 204 });
}
