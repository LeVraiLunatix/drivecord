/**
 * Public link for a file (scope `share`). One active link per file — creating
 * a new one replaces the previous (same `Share` table as the web app).
 *
 * GET    /api/v2/files/:id/share — current link or `{ share: null }`
 * POST   /api/v2/files/:id/share — { expiresInSeconds?, password? } → 201
 * DELETE /api/v2/files/:id/share — revoke
 *
 * `url` points at the hotlink endpoint for password-less links and at the web
 * share page (which prompts for the password) for protected ones.
 */
import { nanoid } from "nanoid";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { BUCKETS, noContent, ok, readOptionalJsonBody, v2Route } from "@/lib/api-v2/http";
import { badRequest, notFound } from "@/lib/api-v2/errors";
import { assertKnownKeys, parseId } from "@/lib/api-v2/validate";

export const runtime = "nodejs";

type Params = { id: string };

const MIN_EXPIRY_SEC = 60;
const MAX_EXPIRY_SEC = 365 * 86_400;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 72; // bcrypt ignores everything past 72 bytes

function shareView(
  share: { token: string; passwordHash: string | null; expiresAt: Date | null },
  origin: string,
) {
  const hasPassword = Boolean(share.passwordHash);
  return {
    token: share.token,
    url: new URL(hasPassword ? `/s/${share.token}` : `/api/v1/public/${share.token}`, origin).toString(),
    passwordProtected: hasPassword,
    expiresAt: share.expiresAt?.toISOString() ?? null,
  };
}

async function requireFile(webhookId: string, id: string) {
  const file = await prisma.driveFile.findFirst({
    where: { id, webhookId, locked: false, trashed: false },
    select: { id: true },
  });
  if (!file) throw notFound("Fichier");
}

export const GET = v2Route<Params>({ scope: "share", bucket: BUCKETS.share }, async ({ req, auth, params }) => {
  const id = parseId(params.id);
  await requireFile(auth.webhook.id, id);
  const share = await prisma.share.findFirst({ where: { fileId: id, webhookId: auth.webhook.id } });
  return ok({ share: share ? shareView(share, req.nextUrl.origin) : null });
});

export const POST = v2Route<Params>({ scope: "share", bucket: BUCKETS.share }, async ({ req, auth, params }) => {
  const id = parseId(params.id);
  const body = await readOptionalJsonBody(req);
  assertKnownKeys(body, ["expiresInSeconds", "password"]);

  let expiresAt: Date | null = null;
  if (body.expiresInSeconds !== undefined && body.expiresInSeconds !== null) {
    const s = body.expiresInSeconds;
    if (typeof s !== "number" || !Number.isInteger(s) || s < MIN_EXPIRY_SEC || s > MAX_EXPIRY_SEC) {
      throw badRequest(`\`expiresInSeconds\` doit être un entier entre ${MIN_EXPIRY_SEC} et ${MAX_EXPIRY_SEC}.`);
    }
    expiresAt = new Date(Date.now() + s * 1000);
  }

  let passwordHash: string | null = null;
  if (body.password !== undefined && body.password !== null) {
    const p = body.password;
    if (typeof p !== "string" || p.length < MIN_PASSWORD || Buffer.byteLength(p) > MAX_PASSWORD) {
      throw badRequest(`\`password\` doit faire entre ${MIN_PASSWORD} et ${MAX_PASSWORD} octets.`);
    }
    passwordHash = await bcrypt.hash(p, 10);
  }

  await requireFile(auth.webhook.id, id);

  // Longer than v1/web tokens (10 chars): ~143 bits, unguessable.
  const token = nanoid(24);
  const [, share] = await prisma.$transaction([
    prisma.share.deleteMany({ where: { fileId: id, webhookId: auth.webhook.id } }),
    prisma.share.create({ data: { token, webhookId: auth.webhook.id, fileId: id, passwordHash, expiresAt } }),
  ]);
  return ok({ share: shareView(share, req.nextUrl.origin) }, { status: 201 });
});

export const DELETE = v2Route<Params>({ scope: "share", bucket: BUCKETS.share }, async ({ auth, params }) => {
  const id = parseId(params.id);
  const { count } = await prisma.share.deleteMany({ where: { fileId: id, webhookId: auth.webhook.id } });
  if (count === 0) throw notFound("Lien");
  return noContent();
});
