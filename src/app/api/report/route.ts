/**
 * POST /api/report — report a public link (`/s/:token`, `/api/v1/public/:token`).
 * Body: { token, reason }. No account needed, so it is tightly rate-limited:
 * per IP and per link. Reports land in the admin page, which can disable the link.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { truncateIp } from "@/lib/api-v1/audit";

export const runtime = "nodejs";

const bodySchema = z.object({
  token: z.string().regex(/^[A-Za-z0-9_-]{6,64}$/),
  reason: z.string().trim().min(3).max(500),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  const perIp = await rateLimit(`report:ip:${ip}`, 5, 3600);
  if (!perIp.ok) {
    return NextResponse.json(
      { error: "Trop de signalements. Réessaie plus tard." },
      { status: 429, headers: { "Retry-After": String(perIp.retryAfterSec) } },
    );
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Signalement invalide (motif de 3 à 500 caractères)." }, { status: 400 });
  }
  const { token, reason } = parsed.data;

  const perToken = await rateLimit(`report:token:${token}`, 20, 86_400);
  if (!perToken.ok) return NextResponse.json({ ok: true }); // already heavily reported; don't help flooding

  const share = await prisma.share.findUnique({ where: { token }, select: { token: true } });
  if (!share) return NextResponse.json({ error: "Lien introuvable." }, { status: 404 });

  await prisma.linkReport.create({ data: { token, reason, ip: truncateIp(ip) } });
  return NextResponse.json({ ok: true }, { status: 201 });
}
