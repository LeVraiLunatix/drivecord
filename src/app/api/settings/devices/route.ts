/**
 * GET /api/settings/devices — list the current user's trusted devices.
 * The current device (matched via the dvc_did cookie) is flagged.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDeviceId } from "@/lib/auth/device";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }

  const current = readDeviceId(req);
  const rows = await prisma.trustedDevice.findMany({
    where: { userId: session.user.id },
    orderBy: { lastSeenAt: "desc" },
    select: {
      id: true,
      deviceId: true,
      deviceLabel: true,
      ip: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });

  const devices = rows.map(({ deviceId, ...d }) => ({
    ...d,
    current: deviceId === current,
  }));

  return NextResponse.json({ devices });
}
