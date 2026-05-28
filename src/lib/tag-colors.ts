/**
 * Deterministic tag color assignment.
 * Each tag always gets the same color based on its name — no extra storage needed.
 */

/** Every class must be a complete static string (Tailwind v4 doesn't purge dynamic strings). */
const PALETTE = [
  { pill: "bg-sky-500/20 text-sky-400 border-sky-500/30",       dot: "bg-sky-400"     },
  { pill: "bg-violet-500/20 text-violet-400 border-violet-500/30", dot: "bg-violet-400" },
  { pill: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30", dot: "bg-emerald-400" },
  { pill: "bg-amber-500/20 text-amber-400 border-amber-500/30",  dot: "bg-amber-400"   },
  { pill: "bg-rose-500/20 text-rose-400 border-rose-500/30",     dot: "bg-rose-400"    },
  { pill: "bg-teal-500/20 text-teal-400 border-teal-500/30",     dot: "bg-teal-400"    },
  { pill: "bg-orange-500/20 text-orange-400 border-orange-500/30", dot: "bg-orange-400" },
  { pill: "bg-pink-500/20 text-pink-400 border-pink-500/30",     dot: "bg-pink-400"    },
] as const;

function hash(s: string): number {
  return [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xffff, 0);
}

export function tagPill(tag: string): string {
  return PALETTE[hash(tag) % PALETTE.length].pill;
}

export function tagDot(tag: string): string {
  return PALETTE[hash(tag) % PALETTE.length].dot;
}
