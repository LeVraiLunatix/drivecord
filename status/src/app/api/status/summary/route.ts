import { CORS_HEADERS, serializeSummary } from "@/lib/public-api";
import { siteUrl } from "@/lib/site";
import { getSnapshot } from "@/lib/snapshot";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

/** One-line summary (indicator + description), cheap to poll. */
export async function GET() {
  const snap = await getSnapshot();
  return Response.json(serializeSummary(snap, siteUrl()), { headers: CORS_HEADERS });
}
