import { formatDate, formatDuration, formatUptime } from "./format";
import { STATUS_LABEL_FR, type Status } from "./types";

/**
 * The 90-day bar travels as a compact string, not as 90 DOM nodes per component: with ~30 components that
 * is the difference between a ~20 KB page and a ~2 MB one. The server paints the bar with one gradient;
 * a small client script decodes the same string for the tooltip and keyboard navigation.
 */
export type BarDay = { date: string; status: Status | "nodata"; uptime: number | null; downMinutes: number };

const LETTER: Record<Status | "nodata", string> = {
  nodata: "n",
  operational: "o",
  degraded: "d",
  partial_outage: "p",
  major_outage: "m",
  maintenance: "t",
  unknown: "u",
};
const BY_LETTER = Object.fromEntries(Object.entries(LETTER).map(([s, l]) => [l, s])) as Record<string, Status | "nodata">;

const FILL: Record<Status | "nodata", string> = {
  nodata: "var(--nodata)",
  operational: "var(--ok-fill)",
  degraded: "var(--warn-fill)",
  partial_outage: "var(--orange-fill)",
  major_outage: "var(--bad-fill)",
  maintenance: "var(--maint-fill)",
  unknown: "color-mix(in oklab, var(--nodata) 60%, var(--bg))",
};

/**
 * `o*40;d|99.12|7;n;…` — a letter per day, plus `|uptime|downMinutes` when there is something to say.
 * Identical neighbouring tokens collapse to `token*count`.
 */
export function encodeDays(days: BarDay[]): string {
  const tokens = days.map((d) => {
    const letter = LETTER[d.status];
    if (d.uptime === null && d.downMinutes === 0) return letter;
    return `${letter}|${d.uptime === null ? "" : d.uptime.toFixed(2)}|${d.downMinutes || ""}`;
  });
  const out: string[] = [];
  for (let i = 0; i < tokens.length; ) {
    let j = i;
    while (j < tokens.length && tokens[j] === tokens[i]) j++;
    out.push(j - i > 1 ? `${tokens[i]}*${j - i}` : tokens[i]!);
    i = j;
  }
  return out.join(";");
}

/** Inverse of `encodeDays`; `endDate` (yyyy-mm-dd, UTC) is the date of the last day. */
export function decodeDays(encoded: string, endDate: string): BarDay[] {
  const tokens = (encoded ? encoded.split(";") : []).flatMap((t) => {
    const m = /^(.*)\*(\d{1,3})$/.exec(t);
    return m ? Array<string>(Math.min(Number(m[2]), 400)).fill(m[1]!) : [t];
  });
  const end = Date.parse(`${endDate}T00:00:00Z`);
  return tokens.map((t, i) => {
    const [letter = "n", up = "", down = ""] = t.split("|");
    return {
      date: new Date(end - (tokens.length - 1 - i) * 86_400_000).toISOString().slice(0, 10),
      status: BY_LETTER[letter] ?? "nodata",
      uptime: up === "" ? null : Number(up),
      downMinutes: down === "" ? 0 : Number(down),
    };
  });
}

/** One hard-stop gradient with a stop per *run* of identical days (typically a handful per bar). */
export function barBackground(days: BarDay[]): string {
  if (!days.length) return "var(--nodata)";
  const stops: string[] = [];
  let start = 0;
  for (let i = 1; i <= days.length; i++) {
    if (i === days.length || days[i]!.status !== days[start]!.status) {
      const color = FILL[days[start]!.status];
      stops.push(`${color} ${((start / days.length) * 100).toFixed(3)}% ${((i / days.length) * 100).toFixed(3)}%`);
      start = i;
    }
  }
  return `linear-gradient(to right, ${stops.join(", ")})`;
}

/** The sentence read by the tooltip, the live region and the text alternative. */
export function describeDay(d: BarDay): string {
  if (d.status === "nodata") return `${formatDate(d.date)} : pas de données`;
  const label = d.status === "unknown" ? "non vérifié" : STATUS_LABEL_FR[d.status].toLowerCase();
  const up = d.uptime === null ? "" : ` · ${formatUptime(d.uptime)} de disponibilité`;
  const down = d.downMinutes > 0 ? ` · ${formatDuration(d.downMinutes)} de panne` : "";
  return `${formatDate(d.date)} : ${label}${up}${down}`;
}

/** Days worth reading out (anything that was not plainly fine), for the screen-reader text alternative. */
export const notableDays = (days: BarDay[]): BarDay[] => days.filter((d) => d.status !== "operational" && d.status !== "nodata");
