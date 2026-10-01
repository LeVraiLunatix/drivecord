/** POST /api/oauth/revoke (RFC 7009) — revoke an access or refresh token (and its whole family). */
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { OAuthError, findApp, revokeByToken } from "@/lib/oauth/server";
import { NO_STORE, PREFLIGHT, corsFor, oauthError, readClientRequest } from "@/lib/oauth/http";

export const runtime = "nodejs";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PREFLIGHT });
}

export async function POST(req: NextRequest) {
  let cors: Record<string, string> = {};
  try {
    const rl = await rateLimit(`oauth:revoke:ip:${getClientIp(req)}`, 60, 60);
    if (!rl.ok) throw new OAuthError("invalid_request", "Trop de requêtes.", 429);
    const { params, clientId, clientSecret } = await readClientRequest(req);
    const app = clientId ? await findApp(clientId) : null;
    if (!app) throw new OAuthError("invalid_client", "Application inconnue ou désactivée.", 401);
    cors = corsFor(req.headers.get("origin"), app.allowedOrigins);
    await revokeByToken(app, clientSecret, params.get("token"));
    return new NextResponse(null, { status: 200, headers: { ...NO_STORE, ...cors } });
  } catch (err) {
    if (err instanceof OAuthError) return oauthError(err, cors);
    console.error("[oauth/revoke]", err);
    return NextResponse.json({ error: "server_error" }, { status: 500, headers: NO_STORE });
  }
}
