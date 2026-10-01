/**
 * GET /api/health — what the status banner polls. Always answers 200 when the app itself runs, with the
 * state of its dependencies (a dead database makes the route 503 so uptime monitors notice too).
 * `MAINTENANCE_MESSAGE` (env) forces a notice on every page — set it before a planned maintenance.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))]);

let discordCache: { ok: boolean; at: number } | null = null;
async function discordReachable(): Promise<boolean> {
  if (discordCache && Date.now() - discordCache.at < 30_000) return discordCache.ok;
  let ok = false;
  try {
    const r = await withTimeout(fetch("https://discord.com/api/v10/gateway", { cache: "no-store" }), 3000);
    ok = r.ok;
  } catch {
    ok = false;
  }
  discordCache = { ok, at: Date.now() };
  return ok;
}

export async function GET() {
  const [db, discord] = await Promise.all([
    withTimeout(prisma.$queryRaw`select 1`, 2500).then(() => true, () => false),
    discordReachable(),
  ]);
  const message = process.env.MAINTENANCE_MESSAGE?.trim().slice(0, 300) || null;
  return NextResponse.json(
    { ok: db && discord && !message, db, discord, message },
    { status: db ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
