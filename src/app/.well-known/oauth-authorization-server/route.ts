/** RFC 8414 discovery document. */
import { NextRequest, NextResponse } from "next/server";
import { APP_SCOPES } from "@/lib/oauth/core";

export function GET(req: NextRequest) {
  const base = req.nextUrl.origin;
  return NextResponse.json(
    {
      issuer: base,
      authorization_endpoint: `${base}/oauth/authorize`,
      token_endpoint: `${base}/api/oauth/token`,
      revocation_endpoint: `${base}/api/oauth/revoke`,
      scopes_supported: APP_SCOPES,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
      revocation_endpoint_auth_methods_supported: ["none", "client_secret_basic", "client_secret_post"],
      service_documentation: `${base}/docs/technique/api-v2`,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
