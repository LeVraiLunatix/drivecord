import type { Metadata } from "next";
import { Markdown } from "@/components/markdown";
import { loadChangelog } from "@/lib/changelog";
import { formatDate } from "@/lib/format";

export const revalidate = 600;
export const metadata: Metadata = { title: "Nouveautés", description: "Les changements notables de Drivecord." };

export default async function News() {
  const entries = await loadChangelog();
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold">Nouveautés</h1>
        <p className="mt-1 text-sm text-muted">Les changements notables de Drivecord, du plus récent au plus ancien.</p>
      </header>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">Les nouveautés ne sont pas disponibles pour le moment.</p>
      ) : (
        <ol className="space-y-6">
          {entries.map((e) => (
            <li key={e.slug} id={e.slug} className="rounded-2xl border border-line bg-card p-5" data-testid="news-entry">
              <h2 className="text-lg font-semibold">{e.title}</h2>
              {e.date ? <p className="text-xs text-muted">{formatDate(e.date)}</p> : null}
              <div className="mt-3 text-sm">
                <Markdown>{e.markdown}</Markdown>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
