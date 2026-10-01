import { CORS_HEADERS, serializeStatus } from "@/lib/public-api";
import { siteUrl } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** Full public status: every component with its state, 90-day uptime and 24 h median latency. */
export async function GET() {
  const snap = await getSnapshot();
  return Response.json(serializeStatus(snap, siteUrl()), { headers: CORS_HEADERS });
}
