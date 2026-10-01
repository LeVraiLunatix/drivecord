/** DELETE /api/account/apps/[grantId] — disconnect an app: all its tokens die immediately. */
import { NextRequest, NextResponse } from "next/server";
import { isResponse, requireUser } from "@/lib/e2ee-server";
import { revokeGrant } from "@/lib/oauth/server";

export const runtime = "nodejs";

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ grantId: string }> }) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { grantId } = await params;
  if (!(await revokeGrant(grantId, u.userId))) return NextResponse.json({ error: "Connexion introuvable." }, { status: 404 });
  return new NextResponse(null, { status: 204 });
}
