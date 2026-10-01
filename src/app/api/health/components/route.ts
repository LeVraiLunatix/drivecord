/**
 * GET /api/health/components — per-component state for the public status page (status.drivecord.app).
 *
 * Public, read-only, no side effects. Exposes only `{ id, status, latencyMs }` per component plus the
 * operators' maintenance notice: no versions, no hostnames, no raw errors. Cached 15 s in memory and
 * rate-limited per IP (the limiter is best-effort: if it cannot reach the database, the answer — which
 * then reports the database as down — is still served).
 */
import { NextResponse } from "next/server";
import { getClientIp, rateLimit, rateLimitHeaders } from "@/lib/rate-limit";
import { getComponentsPayload } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(req: Request) {
  try {
    const rl = await rateLimit(`health:components:ip:${getClientIp(req)}`, 60, 60);
    if (!rl.ok) {
      return NextResponse.json({ error: "Trop de requêtes." }, { status: 429, headers: { ...NO_STORE, ...rateLimitHeaders(rl) } });
    }
  } catch {
    /* database unreachable: fall through and report it */
  }
  return NextResponse.json(await getComponentsPayload(), { headers: NO_STORE });
}
