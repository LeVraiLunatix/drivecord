/**
 * GET /api/v1/me — verify an API key and describe what it can do.
 * Handy as a first integration smoke test.
 */
import { NextRequest } from "next/server";
import { authenticateApiKey, corsJson, preflight } from "../_helpers";

export const runtime = "nodejs";

export async function OPTIONS() {
  return preflight();
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (!auth) {
    return corsJson({ error: "Clé API invalide ou manquante." }, { status: 401 });
  }
  return corsJson({
    drive: auth.webhook.name,
    driveId: auth.webhook.driveId,
    scopes: auth.apiKey.scopes,
  });
}
