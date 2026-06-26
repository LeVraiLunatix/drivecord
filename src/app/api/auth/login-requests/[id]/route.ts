/**
 * POST /api/auth/login-requests/[id]   body: { action: "approve" | "deny" }
 *
 * A trusted (full-session) device approves or denies a pending request that
 * belongs to the same account.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDeviceId } from "@/lib/auth/device";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: "approve" | "deny";
  };
  if (body.action !== "approve" && body.action !== "deny") {
    return NextResponse.json({ error: "Action invalide." }, { status: 400 });
  }

  const lr = await prisma.loginRequest.findFirst({
    where: { id, userId: session.user.id },
  });
  if (!lr) {
    return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  }
  if (lr.status !== "pending") {
    return NextResponse.json({ ok: true, status: lr.status });
  }
  if (lr.expiresAt.getTime() < Date.now()) {
    await prisma.loginRequest.update({
      where: { id },
      data: { status: "expired" },
    });
    return NextResponse.json({ error: "Demande expirée." }, { status: 410 });
  }

  const status = body.action === "approve" ? "approved" : "denied";
  await prisma.loginRequest.update({
    where: { id },
    data: { status, approvedByDeviceId: readDeviceId(req) ?? null },
  });

  return NextResponse.json({ ok: true, status });
}
