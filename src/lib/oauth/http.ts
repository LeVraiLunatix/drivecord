/** Shared HTTP helpers for the OAuth endpoints. */
import { NextResponse } from "next/server";
import { OAuthError } from "./server";

export const NO_STORE = { "Cache-Control": "no-store", Pragma: "no-cache" };

export function oauthError(err: OAuthError, extra: Record<string, string> = {}) {
  return NextResponse.json(
    { error: err.error, error_description: err.message },
    { status: err.status, headers: { ...NO_STORE, ...extra, ...(err.status === 401 ? { "WWW-Authenticate": 'Basic realm="drivecord"' } : {}) } },
  );
}

/** Token / revoke endpoints accept form-encoded (per spec) or JSON bodies, and Basic client auth. */
export async function readClientRequest(req: Request): Promise<{ params: URLSearchParams; clientId: string | null; clientSecret: string | null }> {
  const type = (req.headers.get("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  const text = await req.text();
  if (text.length > 16 * 1024) throw new OAuthError("invalid_request", "Requête trop volumineuse.", 413);
  let params: URLSearchParams;
  if (type === "application/json") {
    let obj: unknown;
    try {
      obj = JSON.parse(text);
    } catch {
      throw new OAuthError("invalid_request", "JSON invalide.");
    }
    params = new URLSearchParams();
    if (obj && typeof obj === "object") for (const [k, v] of Object.entries(obj)) if (typeof v === "string") params.set(k, v);
  } else {
    params = new URLSearchParams(text);
  }

  let clientId = params.get("client_id");
  let clientSecret = params.get("client_secret");
  const basic = req.headers.get("authorization");
  if (basic?.startsWith("Basic ")) {
    const [id, ...rest] = Buffer.from(basic.slice(6), "base64").toString("utf8").split(":");
    clientId = decodeURIComponent(id ?? "");
    clientSecret = decodeURIComponent(rest.join(":"));
  }
  return { params, clientId, clientSecret };
}

/** CORS for a browser-based client: only the exact origins the developer registered. */
export function corsFor(origin: string | null, allowedOrigins: readonly string[]): Record<string, string> {
  return origin && allowedOrigins.includes(origin) ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" } : {};
}

export const PREFLIGHT = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};
