"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "motion/react";
import { Megaphone, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Announcement = {
  id: string;
  title: string;
  body: string;
  important: boolean;
};

/** Clé sessionStorage : « vu » est propre à l'onglet/session courant. */
const seenKey = (id: string) => `dc_ann_seen_${id}`;

/**
 * Popup d'annonce affichée à l'arrivée sur le site (tous domaines).
 *
 * Comportement : une fois fermée (« Compris »), elle ne réapparaît plus dans la
 * même session (sessionStorage). Elle réapparaît lors d'une nouvelle visite
 * (nouvel onglet/session), tant que l'annonce n'a pas expiré (durée définie par
 * l'admin, vérifiée côté serveur dans /api/announcement).
 */
export function AnnouncementPopup() {
  const reduce = useReducedMotion();
  const [ann, setAnn] = React.useState<Announcement | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/announcement")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        const a: Announcement | null = data?.announcement ?? null;
        if (cancelled || !a) return;
        try {
          if (sessionStorage.getItem(seenKey(a.id))) return; // déjà vue cette session
        } catch {
          /* sessionStorage indisponible → on affiche quand même */
        }
        setAnn(a);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const dismiss = React.useCallback(() => {
    setAnn((current) => {
      if (current) {
        try {
          sessionStorage.setItem(seenKey(current.id), "1");
        } catch {
          /* ignore */
        }
      }
      return null;
    });
  }, []);

  return (
    <AnimatePresence>
      {ann && (
        <motion.div
          className="fixed inset-0 z-[200] flex items-end justify-center p-4 sm:items-center"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          role="dialog"
          aria-modal="true"
          aria-labelledby="announcement-title"
        >
          <button
            type="button"
            aria-label="Fermer"
            onClick={dismiss}
            className="absolute inset-0 cursor-default bg-black/60 backdrop-blur-sm"
          />
          <motion.div
            className="relative w-full max-w-md rounded-2xl border border-border/60 bg-card p-6 shadow-2xl"
            initial={reduce ? { opacity: 0 } : { y: 28, opacity: 0, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { y: 28, opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
          >
            <button
              type="button"
              aria-label="Fermer"
              onClick={dismiss}
              className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent/60 hover:text-foreground"
            >
              <X className="size-4" />
            </button>

            <div className="mb-3 flex items-center gap-2">
              <span
                className={cn(
                  "flex size-10 items-center justify-center rounded-xl",
                  ann.important
                    ? "bg-amber-500/15 text-amber-400"
                    : "bg-gradient-to-br from-indigo-500/20 to-fuchsia-500/20 text-primary",
                )}
              >
                {ann.important ? (
                  <TriangleAlert className="size-5" />
                ) : (
                  <Megaphone className="size-5" />
                )}
              </span>
              {ann.important && (
                <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-medium text-amber-400">
                  Important
                </span>
              )}
            </div>

            <h2 id="announcement-title" className="pr-6 text-lg font-semibold tracking-tight">
              {ann.title}
            </h2>
            <p className="mt-2 max-h-[50vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
              {ann.body}
            </p>

            <div className="mt-5 flex justify-end">
              <Button onClick={dismiss}>Compris</Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
