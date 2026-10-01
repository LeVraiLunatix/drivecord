/**
 * TEMPORARY diagnostic — remove right after use.
 *
 * Answers 404 unless `DIAG_TOKEN` is set on the server AND the request carries the same value in
 * the `x-diag-token` header. Reports which database this deployment really talks to and whether the
 * 1.0 schema is there. Never returns a password or a full connection URL.
 */
import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { contentOrigin } from "@/lib/usercontent";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
  const expected = process.env.DIAG_TOKEN;
  const given = req.headers.get("x-diag-token");
  if (!expected || expected.length < 16 || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  if (!authorized(req)) return new NextResponse("Not found", { status: 404 });

  const url = (() => {
    try {
      return new URL(process.env.DATABASE_URL ?? "");
    } catch {
      return null;
    }
  })();
  const out: Record<string, unknown> = {
    deployment: process.env.VERCEL_DEPLOYMENT_ID ?? null,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    region: process.env.VERCEL_REGION ?? null,
    urlEndpoint: url?.host.split(".")[0] ?? null,
    urlDatabase: url?.pathname.slice(1) ?? null,
    urlParams: url ? [...url.searchParams.keys()] : null,
    pgEnvNames: Object.keys(process.env).filter((k) => /^PG[A-Z]+$/.test(k)).sort(),
    usercontentOriginSet: Boolean(process.env.USERCONTENT_ORIGIN),
    usercontentOriginValid: contentOrigin() !== null,
    usercontentOriginHost: contentOrigin()?.host ?? null,
  };
  try {
    const [r] = await prisma.$queryRaw<{ db: string; schema: string; usr: string; path: string }[]>`
      select current_database() db, current_schema() schema, current_user usr, current_setting('search_path') path`;
    const cols = await prisma.$queryRaw<{ s: string; c: string }[]>`
      select table_schema s, column_name c from information_schema.columns where table_name = 'Share' order by 1, 2`;
    const mig = await prisma.$queryRaw<{ n: number; last: string | null }[]>`
      select count(*)::int n, max(migration_name) last from "_prisma_migrations" where finished_at is not null`;
    Object.assign(out, {
      connected: r,
      shareColumns: cols.map((x) => `${x.s}.${x.c}`),
      hasFkWrappedForShare: cols.some((x) => x.c === "fkWrappedForShare"),
      migrations: mig[0],
    });
  } catch (e) {
    out.error = e instanceof Error ? e.message.slice(0, 300) : "unknown";
  }
  return NextResponse.json(out, { headers: { "Cache-Control": "no-store" } });
}
