/**
 * GET /api/health — what the status banner polls. Always answers 200 when the app itself runs, with the
 * state of its dependencies (a dead database makes the route 503 so uptime monitors notice too).
 * `MAINTENANCE_MESSAGE` (env) forces a notice on every page — set it before a planned maintenance.
 * Per-component detail for the public status page lives in `/api/health/components`.
 */
import { NextResponse } from "next/server";
import { checkDb, checkDiscord } from "@/lib/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [dbCheck, discordCheck] = await Promise.all([checkDb(), checkDiscord()]);
  const db = dbCheck.status !== "down";
  const discord = discordCheck.status !== "down";
  const message = process.env.MAINTENANCE_MESSAGE?.trim().slice(0, 300) || null;
  return NextResponse.json(
    { ok: db && discord && !message, db, discord, message },
    { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
