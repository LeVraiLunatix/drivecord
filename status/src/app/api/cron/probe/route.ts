import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { runCycle } from "@/lib/cycle";
import { storeFromEnv } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function authorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // No secret configured = the endpoint is closed, never open.
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Runs one probe cycle and records it. Called by Vercel Cron (which sends `Authorization: Bearer $CRON_SECRET`)
 * or by any external scheduler holding the same secret.
 */
async function handle(req: Request) {
  if (!authorized(req)) return Response.json({ error: "unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const r = await runCycle({ store: storeFromEnv() }, { force: true });
  // New data: regenerate the static pages right away instead of waiting for their 30 s window.
  revalidatePath("/");
  revalidatePath("/history");
  revalidatePath("/feed.xml");
  return Response.json({ ok: true, ran: r.ran, stored: r.stored, at: r.latest ? new Date(r.latest.at).toISOString() : null }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
