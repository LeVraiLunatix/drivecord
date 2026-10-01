import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { LocalTime } from "@/components/local-time";
import { Markdown } from "@/components/markdown";
import { COMPONENTS } from "@/lib/components";
import { INCIDENT_STATUS_FR, loadIncidents } from "@/lib/incidents";
import { STATUS_LABEL_FR } from "@/lib/types";

export const revalidate = 60;
export const dynamicParams = true;

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return loadIncidents().map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const inc = loadIncidents().find((i) => i.slug === slug);
  return inc ? { title: inc.title, description: inc.summary || undefined } : { title: "Incident introuvable" };
}

export default async function IncidentPage({ params }: Props) {
  const { slug } = await params;
  const inc = loadIncidents().find((i) => i.slug === slug);
  if (!inc) notFound();
  const names = inc.components === "all" ? ["Tous les systèmes"] : inc.components.map((id) => COMPONENTS.find((c) => c.id === id)?.name ?? id);
  return (
    <article className="space-y-6">
      <p className="text-sm"><Link href="/history" className="text-muted hover:text-fg">← Historique</Link></p>
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{inc.title}</h1>
        <p className="text-sm text-muted">
          {INCIDENT_STATUS_FR[inc.status]} · {STATUS_LABEL_FR[inc.severity]} · {names.join(", ")}
        </p>
        <p className="text-sm text-muted">
          Début : <LocalTime iso={inc.startedAt} />
          {inc.resolvedAt ? <> · Résolu : <LocalTime iso={inc.resolvedAt} /></> : null}
          {!inc.resolvedAt && inc.endsAt ? <> · Fin prévue : <LocalTime iso={inc.endsAt} /></> : null}
        </p>
        {inc.summary ? <p className="text-sm">{inc.summary}</p> : null}
      </header>
      <ol className="space-y-4" aria-label="Journal des mises à jour">
        {inc.updates.map((u) => (
          <li key={u.at + (u.status ?? "")} className="rounded-2xl border border-line bg-card p-4" data-testid="incident-update">
            <p className="text-xs text-muted">
              <LocalTime iso={u.at} />
              {u.status ? <> · <span className="font-medium text-fg">{INCIDENT_STATUS_FR[u.status]}</span></> : null}
            </p>
            <div className="mt-1 text-sm">
              <Markdown>{u.body}</Markdown>
            </div>
          </li>
        ))}
      </ol>
    </article>
  );
}
