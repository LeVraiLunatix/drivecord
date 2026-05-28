/**
 * Generic formatting helpers shared by the UI.
 */

/** Human-readable byte size. 1.5 KiB, 12.3 MiB, etc. */
export function formatBytes(n: number, fractionDigits = 1): string {
  if (!Number.isFinite(n) || n < 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KiB", "MiB", "GiB", "TiB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(fractionDigits)} ${units[i]}`;
}

/** Locale-aware relative time. "Il y a 2 min", "Hier", "12/03/2024", etc. */
export function formatRelativeTime(ts: number, locale = "fr-FR"): string {
  const diff = ts - Date.now();
  const absSec = Math.abs(diff) / 1000;
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
  if (absSec < 60) return rtf.format(Math.round(diff / 1000), "second");
  if (absSec < 3600) return rtf.format(Math.round(diff / 60_000), "minute");
  if (absSec < 86_400) return rtf.format(Math.round(diff / 3_600_000), "hour");
  if (absSec < 604_800)
    return rtf.format(Math.round(diff / 86_400_000), "day");
  return new Date(ts).toLocaleDateString(locale);
}

/** Compute the duration in seconds between two performance.now() readings. */
export function elapsedSeconds(start: number): number {
  return (performance.now() - start) / 1000;
}
