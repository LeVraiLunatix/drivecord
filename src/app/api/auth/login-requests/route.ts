/**
 * POST /api/auth/login-requests
 *
 * Called by a NEW device (pending login_24h session) to ask a trusted device to
 * approve the login. Requires the user to have at least one other trusted
 * device; otherwise the client falls back to the email code.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readDeviceId, deviceLabel } from "@/lib/auth/device";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import {
  generateShortCode,
  generatePollToken,
  requestLocation,
  LOGIN_REQUEST_TTL_MS,
} from "@/lib/auth/login-request";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  if (session.level !== "pending") {
    return NextResponse.json({ error: "Aucune connexion en attente." }, { status: 400 });
  }
  const userId = session.user.id;

  const rl = await rateLimit(`loginreq:create:${userId}`, 10, 10 * 60);
  if (!rl.ok) {
    return NextResponse.json({ error: "Trop de demandes." }, { status: 429 });
  }

  const currentDeviceId = readDeviceId(req);
  const trustedCount = await prisma.trustedDevice.count({
    where: {
      userId,
      ...(currentDeviceId ? { NOT: { deviceId: currentDeviceId } } : {}),
    },
  });
  if (trustedCount === 0) {
    return NextResponse.json(
      { error: "Aucun appareil de confiance disponible.", fallback: "email" },
      { status: 409 },
    );
  }

  // Drop any stale pending requests for this user before creating a new one.
  await prisma.loginRequest.deleteMany({
    where: { userId, status: "pending" },
  });

  const request = await prisma.loginRequest.create({
    data: {
      userId,
      requestingDeviceLabel: deviceLabel(req.headers.get("user-agent")),
      requestingIp: getClientIp(req),
      requestingLocation: requestLocation(req),
      shortCode: generateShortCode(),
      pollToken: generatePollToken(),
      status: "pending",
      expiresAt: new Date(Date.now() + LOGIN_REQUEST_TTL_MS),
    },
    select: { id: true, shortCode: true, pollToken: true, expiresAt: true },
  });

  return NextResponse.json(request);
}
