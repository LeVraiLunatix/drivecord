import Link from "next/link";
import { BarInteractions } from "@/components/bar-interactions";
import { LiveRefresh } from "@/components/live-refresh";
import { LocalTime } from "@/components/local-time";
import { Markdown } from "@/components/markdown";
import { GlobalBanner, StatusLabel } from "@/components/status-ui";
import { UptimeBar } from "@/components/uptime-bar";
import { loadChangelog } from "@/lib/changelog";
import { formatAgo, formatDate, formatMs, formatUptime } from "@/lib/format";
import { INCIDENT_STATUS_FR } from "@/lib/incidents";
import { getSnapshot, type ComponentView } from "@/lib/snapshot";
import { STATUS_LABEL_FR } from "@/lib/types";

// Static page regenerated at most every 30 s (ISR); /api/status/summary + LiveRefresh keep open tabs current.
export const revalidate = 30;

function Row({ c, hasHistory }: { c: ComponentView; hasHistory: boolean }) {
  return (
    <li className="py-4" data-testid="component" data-id={c.id} data-status={c.status}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h3 className="text-[0.95rem] font-medium">{c.name}</h3>
          <p className="text-xs text-muted">{c.fromIncident ? "Statut défini par un incident en cours. " : ""}{c.description}</p>
        </div>
        <StatusLabel status={c.status} />
      </div>
      <div className="mt-3">
        <UptimeBar name={c.name} days={c.days} />
        <div className="mt-1.5 flex justify-between text-[0.7rem] text-muted">
          <span>Il y a 90 jours</span>
          <span>
            {c.uptime !== null ? <>Disponibilité {formatUptime(c.uptime)}</> : hasHistory ? "Disponibilité : historique insuffisant" : "Historique en cours de constitution"}
            {c.p50Ms !== null ? <> · médiane sur 24 h : {formatMs(c.p50Ms)}</> : null}
          </span>
          <span>Aujourd'hui</span>
        </div>
      </div>
    </li>
  );
}

export default async function Home() {
  const [snap, changelog] = await Promise.all([getSnapshot({ refresh: process.env.NEXT_PHASE !== "phase-production-build" }), loadChangelog()]);
  const now = snap.now;
  const hasHistory = snap.historyDays > 0;
  const news = changelog.slice(0, 3);

  return (
    <div className="space-y-8">
      <BarInteractions />
      <div id="bar-live" aria-live="polite" className="sr-only" />
      <LiveRefresh checkedAt={snap.checkedAt} />

      <section className="space-y-3">
        <GlobalBanner
          status={snap.overall.status}
          text={snap.overall.text}
          detail={snap.checkedAt ? `Dernière vérification ${formatAgo(snap.checkedAt, now)}.` : "Aucune vérification n'a encore été enregistrée."}
        />

        {snap.maintenanceMessage ? (
          <div role="note" className="rounded-2xl border border-maint/50 bg-maint/10 px-5 py-3 text-sm" data-testid="maintenance-message">
            <p className="font-semibold text-maint">Maintenance</p>
            <p className="mt-0.5">{snap.maintenanceMessage}</p>
          </div>
        ) : null}

        {snap.upcomingMaintenances.map((m) => (
          <div key={m.slug} role="note" className="rounded-2xl border border-warn/50 bg-warn/10 px-5 py-3 text-sm" data-testid="upcoming-maintenance">
            <p className="font-semibold text-warn">Maintenance prévue</p>
            <p className="mt-0.5">
              <Link href={`/incidents/${m.slug}`} className="font-medium underline underline-offset-2">{m.title}</Link>
            </p>
            <p className="mt-1 text-muted">
              Du <LocalTime iso={m.startedAt} />
              {m.endsAt ? <> au <LocalTime iso={m.endsAt} /></> : null}
            </p>
          </div>
        ))}
      </section>

      {snap.activeIncidents.length > 0 ? (
        <section aria-labelledby="incidents-actifs" className="space-y-3">
          <h2 id="incidents-actifs" className="text-lg font-semibold">Incidents en cours</h2>
          <ul className="space-y-3">
            {snap.activeIncidents.map((i) => (
              <li key={i.slug} className="rounded-2xl border border-line bg-card p-4" data-testid="active-incident">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Link href={`/incidents/${i.slug}`} className="font-medium underline-offset-2 hover:underline">{i.title}</Link>
                  <span className="text-xs text-muted">{INCIDENT_STATUS_FR[i.status]} · {STATUS_LABEL_FR[i.severity]}</span>
                </div>
                {i.updates[0] ? (
                  <div className="mt-2 text-sm">
                    <p className="text-xs text-muted"><LocalTime iso={i.updates[0].at} /></p>
                    <Markdown>{i.updates[0].body}</Markdown>
                  </div>
                ) : i.summary ? <p className="mt-2 text-sm">{i.summary}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="systemes" className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="systemes" className="text-lg font-semibold">Systèmes</h2>
          {snap.uptimeOverall !== null ? (
            <p className="text-sm text-muted">Disponibilité globale sur 90 jours : <span className="font-medium text-fg">{formatUptime(snap.uptimeOverall)}</span></p>
          ) : (
            <p className="text-sm text-muted" data-testid="history-building">Historique en cours de constitution</p>
          )}
        </div>
        {snap.historyUnavailable ? (
          <p role="note" className="rounded-xl border border-line bg-subtle px-4 py-2 text-sm text-muted">L'historique est momentanément indisponible ; l'état actuel ci-dessous reste à jour.</p>
        ) : null}

        {snap.groups.map((g) => (
          <details key={g.id} open className="group rounded-2xl border border-line bg-card" data-testid="group" data-id={g.id}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <span className="font-medium">{g.name}</span>
              <span className="flex items-center gap-3">
                <StatusLabel status={g.status} />
                <span aria-hidden className="text-muted transition-transform group-open:rotate-180">▾</span>
              </span>
            </summary>
            <ul className="divide-y divide-line border-t border-line px-4">
              {g.components.map((c) => (
                <Row key={c.id} c={c} hasHistory={hasHistory} />
              ))}
            </ul>
          </details>
        ))}
      </section>

      {news.length > 0 ? (
        <section aria-labelledby="nouveautes" className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 id="nouveautes" className="text-lg font-semibold">Nouveautés</h2>
            <Link href="/nouveautes" className="text-sm text-accent underline-offset-2 hover:underline">Tout voir</Link>
          </div>
          <ul className="space-y-3">
            {news.map((n) => (
              <li key={n.slug} className="rounded-2xl border border-line bg-card p-4">
                <p className="font-medium">{n.title}</p>
                {n.date ? <p className="text-xs text-muted">{formatDate(n.date)}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
