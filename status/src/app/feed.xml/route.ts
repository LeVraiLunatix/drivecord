import { loadChangelog } from "@/lib/changelog";
import { buildAtom, feedEntries } from "@/lib/feeds";
import { loadIncidents } from "@/lib/incidents";
import { siteUrl } from "@/lib/site";

export const revalidate = 300;

export async function GET() {
  const site = siteUrl();
  const xml = buildAtom(site, feedEntries(loadIncidents(), await loadChangelog(), site));
  return new Response(xml, { headers: { "Content-Type": "application/atom+xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" } });
}
