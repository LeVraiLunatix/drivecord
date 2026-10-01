const TZ_UTC = "UTC";

/** 99,98 % — truncated, never rounded up: 99,999 % must not read as a perfect 100 %. */
export function formatUptime(percent: number): string {
  const p = percent >= 100 ? 100 : Math.floor(percent * 100) / 100;
  return `${p.toLocaleString("fr-FR", { minimumFractionDigits: p === 100 ? 0 : 2, maximumFractionDigits: 2 })} %`;
}

export const formatMs = (ms: number | null): string => (ms === null ? "—" : `${Math.round(ms).toLocaleString("fr-FR")} ms`);

const dateFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: TZ_UTC });
const monthFmt = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: TZ_UTC });
const dateTimeUtcFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: TZ_UTC });

export const formatDate = (iso: string): string => dateFmt.format(new Date(iso));
export const formatMonth = (iso: string): string => monthFmt.format(new Date(iso));
export const formatDateTimeUtc = (iso: string): string => `${dateTimeUtcFmt.format(new Date(iso))} UTC`;

/** "il y a 3 min" — coarse, for the last-check line. */
export function formatAgo(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  if (s < 60) return "à l'instant";
  const m = Math.round(s / 60);
  if (m < 60) return `il y a ${m} min`;
  const h = Math.round(m / 60);
  if (h < 48) return `il y a ${h} h`;
  return `il y a ${Math.round(h / 24)} j`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 1) return "moins d'une minute";
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}
