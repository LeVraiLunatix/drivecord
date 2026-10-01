import { storeFromEnv } from "@/lib/store";

export const dynamic = "force-dynamic";

/** The status page's own liveness check (it never depends on Drivecord to answer this). */
export function GET() {
  return Response.json({ ok: true, storage: storeFromEnv().kind }, { headers: { "Cache-Control": "no-store" } });
}
