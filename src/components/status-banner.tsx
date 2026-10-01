"use client";

import * as React from "react";
import { usePathname } from "next/navigation";
import { TriangleAlert } from "lucide-react";
import { apiUrl } from "@/lib/api-base";
import { STATUS_URL } from "@/lib/status-url";

type Health = { ok: boolean; db: boolean; discord: boolean; message: string | null };
const OK_POLL_MS = 60_000;
const BAD_POLL_MS = 15_000;
/** A single hiccup shouldn't flash a warning: wait for two bad answers in a row. */
const FAILS_BEFORE_SHOWING = 2;

function describe(h: Health | null, offline: boolean): string | null {
  if (offline) return "Tu es hors ligne : certaines fonctions sont temporairement inaccessibles.";
  if (!h) return "Impossible de joindre les serveurs Drivecord pour le moment. Certains services sont temporairement inaccessibles.";
  if (h.message) return h.message;
  if (!h.db) return "Drivecord rencontre un problème technique : tes fichiers et ton compte sont temporairement inaccessibles. On s'en occupe.";
  if (!h.discord) return "Discord semble injoignable : l'envoi et le téléchargement de fichiers peuvent échouer temporairement.";
  return null;
}

/**
 * Yellow notice when something is down: the site itself (health call fails), the database, Discord,
 * the user's own connection — or a planned-maintenance message. Polls quietly; hidden when all is well.
 */
export function StatusBanner() {
  const pathname = usePathname() ?? "";
  const [state, setState] = React.useState<{ health: Health | null; failed: boolean; fails: number }>({ health: null, failed: false, fails: 0 });
  const [offline, setOffline] = React.useState(false);
  const embedded = pathname.startsWith("/embed/");

  React.useEffect(() => {
    if (embedded) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    const check = async () => {
      let next: { health: Health | null; failed: boolean };
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const r = await fetch(apiUrl("/api/health"), { cache: "no-store", signal: ctrl.signal });
        clearTimeout(t);
        const h = (await r.json()) as Health;
        next = { health: h, failed: !h.ok };
      } catch {
        next = { health: null, failed: true };
      }
      if (cancelled) return;
      setState((s) => ({ ...next, fails: next.failed ? s.fails + 1 : 0 }));
      timer = setTimeout(check, next.failed ? BAD_POLL_MS : OK_POLL_MS);
    };
    void check();
    const onVisible = () => { if (document.visibilityState === "visible") { clearTimeout(timer); void check(); } };
    document.addEventListener("visibilitychange", onVisible);
    return () => { cancelled = true; clearTimeout(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [embedded]);

  React.useEffect(() => {
    const sync = () => setOffline(!navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => { window.removeEventListener("online", sync); window.removeEventListener("offline", sync); };
  }, []);

  if (embedded) return null;
  const text = state.fails >= FAILS_BEFORE_SHOWING || offline || state.health?.message ? describe(state.failed ? state.health : null, offline) ?? state.health?.message ?? null : null;
  if (!text) return null;
  return (
    <div role="status" aria-live="polite" data-testid="status-banner" className="sticky top-0 z-[60] flex items-center justify-center gap-2 border-b border-amber-500/40 bg-amber-400 px-4 py-2 text-center text-sm font-medium text-amber-950" style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}>
      <TriangleAlert className="size-4 shrink-0" />
      <span>{text}</span>
      <a href={STATUS_URL} target="_blank" rel="noopener noreferrer" className="shrink-0 underline underline-offset-2 hover:no-underline">
        En savoir plus
      </a>
    </div>
  );
}
