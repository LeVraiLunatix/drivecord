/**
 * POST /api/oauth/token — `authorization_code` (+ PKCE) and `refresh_token` grants.
 * Form-encoded or JSON. Errors follow RFC 6749: `{ error, error_description }`.
 */
import { NextRequest, NextResponse } from "next/server";
import { getClientIp, rateLimit } from "@/lib/rate-limit";
import { OAuthError, exchangeCode, findApp, refreshTokens } from "@/lib/oauth/server";
import { NO_STORE, PREFLIGHT, corsFor, oauthError, readClientRequest } from "@/lib/oauth/http";

export const runtime = "nodejs";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: PREFLIGHT });
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin");
  let cors: Record<string, string> = {};
  try {
    const ip = getClientIp(req);
    const rl = await rateLimit(`oauth:token:ip:${ip}`, 60, 60);
    if (!rl.ok) throw new OAuthError("invalid_request", "Trop de requêtes.", 429);

    const { params, clientId, clientSecret } = await readClientRequest(req);
    const app = clientId ? await findApp(clientId) : null;
    if (!app) throw new OAuthError("invalid_client", "Application inconnue ou désactivée.", 401);
    cors = corsFor(origin, app.allowedOrigins);
    const perApp = await rateLimit(`oauth:token:app:${app.id}`, 600, 60);
    if (!perApp.ok) throw new OAuthError("invalid_request", "Trop de requêtes pour cette application.", 429);

    const grantType = params.get("grant_type");
    const tokens =
      grantType === "authorization_code"
        ? await exchangeCode({ app, clientSecret, code: params.get("code"), redirectUri: params.get("redirect_uri"), codeVerifier: params.get("code_verifier") })
        : grantType === "refresh_token"
          ? await refreshTokens({ app, clientSecret, refreshToken: params.get("refresh_token") })
          : (() => {
              throw new OAuthError("unsupported_grant_type", "grant_type non supporté.");
            })();
    return NextResponse.json(tokens, { headers: { ...NO_STORE, ...cors } });
  } catch (err) {
    if (err instanceof OAuthError) return oauthError(err, cors);
    console.error("[oauth/token]", err);
    return NextResponse.json({ error: "server_error", error_description: "Erreur interne." }, { status: 500, headers: NO_STORE });
  }
}
