import { formatDateTimeUtc } from "./format";

const localFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const utcTimeFmt = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" });

/**
 * "20 oct. 2026, 23:00 (heure locale) · 21:00 UTC". The UTC part repeats the date only when the visitor's
 * calendar day differs from the UTC one, so the line stays short and unambiguous.
 */
export function formatLocalAndUtc(iso: string, timeZone?: string): string {
  const d = new Date(iso);
  const dayOf = (tz?: string) => new Intl.DateTimeFormat("fr-FR", { year: "numeric", month: "numeric", day: "numeric", timeZone: tz }).format(d);
  const utc = dayOf("UTC") === dayOf(timeZone) ? `${utcTimeFmt.format(d)} UTC` : formatDateTimeUtc(iso);
  const local = timeZone ? new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone }).format(d) : localFmt.format(d);
  return `${local} (heure locale) · ${utc}`;
}
