/**
 * GET /api/auth/login-requests/pending
 *
 * Polled by trusted (full-session) devices to surface incoming approval
 * requests for the current account.
 */
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ requests: [] });
  }

  const requests = await prisma.loginRequest.findMany({
    where: {
      userId: session.user.id,
      status: "pending",
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      requestingDeviceLabel: true,
      requestingLocation: true,
      shortCode: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ requests });
}
