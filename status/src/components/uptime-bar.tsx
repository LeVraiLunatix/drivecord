import { barBackground, describeDay, encodeDays, notableDays } from "@/lib/bar";
import type { DayView } from "@/lib/snapshot";

/**
 * 90 days of one component, painted with a single gradient (see lib/bar.ts). Hover, touch and the arrow
 * keys are handled by <BarInteractions/>, which reads `data-days`. The text alternative lists only the
 * days that were not plainly fine.
 */
export function UptimeBar({ name, days }: { name: string; days: DayView[] }) {
  const notable = notableDays(days);
  const last = days.at(-1);
  const summary = notable.length
    ? `${notable.length} jour${notable.length > 1 ? "s" : ""} avec incident ou maintenance sur ${days.length}`
    : last && days.some((d) => d.status !== "nodata")
      ? `Aucun incident sur la période enregistrée`
      : "Historique en cours de constitution";
  return (
    <div
      className="barwrap"
      data-bar
      data-end={last?.date}
      data-days={encodeDays(days)}
      role="group"
      tabIndex={0}
      aria-label={`Disponibilité sur ${days.length} jours : ${name}. ${summary}. Flèches gauche et droite pour parcourir les jours.`}
    >
      <div className="barfill" aria-hidden style={{ backgroundImage: barBackground(days) }} />
      <span className="mark" aria-hidden hidden />
      <span className="tip" aria-hidden hidden />
      {notable.length > 0 ? (
        <ul className="sr-only">
          {notable.map((d) => (
            <li key={d.date}>{describeDay(d)}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
