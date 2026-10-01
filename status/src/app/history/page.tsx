import type { Metadata } from "next";
import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { formatMonth } from "@/lib/format";
import { INCIDENT_STATUS_FR, loadIncidents } from "@/lib/incidents";
import { STATUS_LABEL_FR, type Incident } from "@/lib/types";

export const revalidate = 60;
export const metadata: Metadata = { title: "Historique", description: "Incidents et maintenances passés de Drivecord." };

function byMonth(incidents: Incident[]): [string, Incident[]][] {
  const groups = new Map<string, Incident[]>();
  for (const i of incidents) {
    const key = formatMonth(i.startedAt);
    groups.set(key, [...(groups.get(key) ?? []), i]);
  }
  return [...groups];
}

export default function History() {
  const incidents = loadIncidents();
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold">Historique</h1>
        <p className="mt-1 text-sm text-muted">Les incidents et maintenances, du plus récent au plus ancien.</p>
      </header>
      {incidents.length === 0 ? (
        <p className="rounded-2xl border border-line bg-card p-5 text-sm text-muted" data-testid="no-incidents">Aucun incident ni maintenance enregistré.</p>
      ) : (
        byMonth(incidents).map(([month, list]) => (
          <section key={month} aria-label={month} className="space-y-3">
            <h2 className="text-sm font-semibold capitalize text-muted">{month}</h2>
            <ul className="space-y-3">
              {list.map((i) => (
                <li key={i.slug} className="rounded-2xl border border-line bg-card p-4" data-testid="history-item">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <Link href={`/incidents/${i.slug}`} className="font-medium underline-offset-2 hover:underline">{i.title}</Link>
                    <span className="text-xs text-muted">{INCIDENT_STATUS_FR[i.status]} · {STATUS_LABEL_FR[i.severity]}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted"><LocalTime iso={i.startedAt} /></p>
                  {i.summary ? <p className="mt-2 text-sm">{i.summary}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
