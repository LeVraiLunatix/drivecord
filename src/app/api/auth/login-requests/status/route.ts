/**
 * GET /api/auth/login-requests/status?token=POLL_TOKEN
 *
 * Polled by the NEW device. Once a trusted device approves, opens a full session
 * (only if the caller already holds the matching pending session) and consumes
 * the request.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { markFullSession } from "@/lib/auth/login";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ status: "expired" });
  }

  const lr = await prisma.loginRequest.findUnique({
    where: { pollToken: token },
  });
  if (!lr) {
    return NextResponse.json({ status: "expired" });
  }

  if (lr.status === "pending" && lr.expiresAt.getTime() < Date.now()) {
    await prisma.loginRequest.update({
      where: { id: lr.id },
      data: { status: "expired" },
    });
    return NextResponse.json({ status: "expired" });
  }

  if (lr.status !== "approved") {
    return NextResponse.json({ status: lr.status });
  }

  // Approved: the requesting device must still hold the pending session it
  // created the request with, and it must belong to the same user.
  const session = await auth();
  if (!session?.user?.id || session.user.id !== lr.userId) {
    return NextResponse.json({ status: "pending" });
  }
  const user = await prisma.user.findUnique({
    where: { id: lr.userId },
    select: { id: true, email: true, name: true, image: true },
  });
  if (!user) {
    return NextResponse.json({ status: "expired" });
  }

  const res = NextResponse.json({ status: "approved" });
  await markFullSession(req, res, user);
  await prisma.loginRequest.delete({ where: { id: lr.id } }).catch(() => {});
  return res;
}
