/**
 * GET  /api/e2ee/transfer/[id] — state of one request (polled by the new device)
 * POST /api/e2ee/transfer/[id] — advance the protocol. Body `{ action, … }`:
 *   challenge  (approver)   { approverNonce }                    pending → challenged
 *   reveal     (new device) { requesterPublicKey, requesterNonce } checked against the commitment
 *   approve    (approver)   { approverPublicKey, sealedMk }       only once revealed
 *   deny       (either)
 *
 * The server enforces the order of the steps and that every blob has the right shape,
 * but it never sees a secret: the Master Key travels sealed to the new device's key.
 */
import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { isResponse, readBody, requireUser, wrappedBlob } from "@/lib/e2ee-server";

export const runtime = "nodejs";

const b64Fixed = (bytes: number) => {
  const len = Math.ceil((bytes * 4) / 3 / 4) * 4;
  return z.string().length(len).regex(/^[A-Za-z0-9+/]+={0,2}$/);
};

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("challenge"), approverNonce: b64Fixed(16) }),
  z.object({ action: z.literal("reveal"), requesterPublicKey: b64Fixed(32), requesterNonce: b64Fixed(16) }),
  z.object({ action: z.literal("approve"), approverPublicKey: b64Fixed(32), sealedMk: wrappedBlob }),
  z.object({ action: z.literal("deny") }),
]);

type Ctx = { params: Promise<{ id: string }> };

async function load(userId: string, id: string) {
  const row = await prisma.keyTransferRequest.findFirst({ where: { id, userId } });
  if (!row) return null;
  if (row.status === "pending" && row.expiresAt.getTime() <= Date.now()) return { ...row, status: "expired" };
  return row;
}

const view = (r: NonNullable<Awaited<ReturnType<typeof load>>>) => ({
  id: r.id,
  status: r.status,
  label: r.label,
  commitment: r.commitment,
  approverNonce: r.approverNonce,
  requesterPublicKey: r.requesterPublicKey,
  requesterNonce: r.requesterNonce,
  approverPublicKey: r.status === "approved" ? r.approverPublicKey : null,
  sealedMk: r.status === "approved" ? r.sealedMk : null,
  expiresAt: r.expiresAt,
});

export async function GET(_req: NextRequest, { params }: Ctx) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { id } = await params;
  const row = await load(u.userId, id);
  if (!row) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  return NextResponse.json(view(row));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const u = await requireUser();
  if (isResponse(u)) return u;
  const { id } = await params;
  const l = await rateLimit(`e2ee:transfer:act:${u.userId}`, 60, 60);
  if (!l.ok) return NextResponse.json({ error: "Trop de requêtes." }, { status: 429, headers: { "Retry-After": String(l.retryAfterSec) } });
  const body = await readBody(req, actionSchema);
  if (isResponse(body)) return body;

  const row = await load(u.userId, id);
  if (!row) return NextResponse.json({ error: "Demande introuvable." }, { status: 404 });
  if (row.status === "expired") return NextResponse.json({ error: "Cette demande a expiré." }, { status: 410 });
  if (row.status !== "pending") return NextResponse.json({ error: "Cette demande est déjà traitée." }, { status: 409 });

  // Each step is an atomic compare-and-set on the exact previous state.
  const step = async (where: Record<string, unknown>, data: Record<string, unknown>) =>
    (await prisma.keyTransferRequest.updateMany({ where: { id, userId: u.userId, status: "pending", ...where }, data })).count === 1;
  const conflict = () => NextResponse.json({ error: "Étape hors séquence." }, { status: 409 });

  switch (body.action) {
    case "challenge": {
      if (!(await step({ approverNonce: null }, { approverNonce: body.approverNonce }))) return conflict();
      break;
    }
    case "reveal": {
      if (!row.approverNonce) return conflict();
      const expected = createHash("sha256")
        .update("drivecord:commit:v1")
        .update(Buffer.from(body.requesterPublicKey, "base64"))
        .update(Buffer.from(body.requesterNonce, "base64"))
        .digest("base64");
      if (expected !== row.commitment) return NextResponse.json({ error: "Révélation incohérente avec l'engagement." }, { status: 400 });
      if (!(await step({ requesterPublicKey: null }, { requesterPublicKey: body.requesterPublicKey, requesterNonce: body.requesterNonce }))) return conflict();
      break;
    }
    case "approve": {
      if (!row.requesterPublicKey) return conflict();
      if (!(await step({ sealedMk: null }, { status: "approved", approverPublicKey: body.approverPublicKey, sealedMk: body.sealedMk }))) return conflict();
      break;
    }
    case "deny": {
      await step({}, { status: "denied" });
      break;
    }
  }
  const fresh = await load(u.userId, id);
  return NextResponse.json(view(fresh!));
}
