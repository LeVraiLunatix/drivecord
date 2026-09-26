/**
 * POST /api/account/cord/sync — the client signals the end of a batch whose
 * numbers matter on the Compte Cord hub (uploads are recorded file by file, so
 * only the client knows when a batch is over).
 *
 * Body: { reason: "uploads" } | { reason: "backup", count: number }
 *  - "uploads": refresh the Drivecord tile status.
 *  - "backup" : camera-roll backup finished → notification + status.
 *
 * Always 202 and nothing is awaited: the Cord calls run after the response and
 * are no-ops for users without a linked Cord account (see lib/cord-sync.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { afterCordNotify, afterCordStatus, DRIVECORD_URL } from "@/lib/cord-sync";
import { formatCountFr } from "@/lib/cord-sync-core";

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || session.level !== "full") {
    return NextResponse.json({ error: "Non authentifié." }, { status: 401 });
  }
  const userId = session.user.id;
  const body = (await req.json().catch(() => ({}))) as { reason?: unknown; count?: unknown };

  if (body.reason === "backup") {
    const count = typeof body.count === "number" && Number.isFinite(body.count) ? Math.trunc(body.count) : 0;
    if (count > 0 && count <= 1_000_000) {
      afterCordNotify(
        userId,
        {
          title: "Sauvegarde terminée",
          body: `${formatCountFr(count)} ${count > 1 ? "photos et vidéos envoyées" : "photo ou vidéo envoyée"} depuis ton iPhone.`,
          url: `${DRIVECORD_URL}/backup`,
        },
        { kind: { key: "backup", limit: 3, windowSec: 3600 } },
      );
    }
  } else if (body.reason !== "uploads") {
    return NextResponse.json({ error: "Raison invalide." }, { status: 400 });
  }

  afterCordStatus(userId);
  return new NextResponse(null, { status: 202 });
}
