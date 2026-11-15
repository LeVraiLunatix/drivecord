"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Accent, Headline } from "@/kitcord";
import { AuthBackground } from "@/components/auth/auth-background";
import { cn } from "@/lib/utils";

/**
 * Coquille KitCord des pages « autonomes » (réglages, partages, stats, développeurs…) :
 * la lumière du bas en version calme derrière le contenu, la barre de verre flottante du kit
 * avec un retour, puis une colonne centrée. Sombre : verre et lumière ; clair : barre claire.
 */
export function PageShell({
  children,
  back,
  backLabel = "Retour",
  section,
  width = "max-w-3xl",
  className,
}: {
  children: React.ReactNode;
  /** Où mène le retour (le parent logique de la page). */
  back?: string;
  backLabel?: string;
  /** Le nom de la page, en gris à côté du mot-symbole. */
  section?: string;
  width?: string;
  className?: string;
}) {
  return (
    <div className="kit-page relative flex min-h-[100dvh] flex-col">
      <AuthBackground />
      <header className="cord-topbar">
        <div className="flex min-w-0 items-center gap-1">
          {back && (
            <Link
              href={back}
              aria-label={backLabel}
              className="-ml-3 inline-flex size-11 shrink-0 items-center justify-center rounded-full text-[var(--cord-dim)] transition-colors hover:text-foreground"
            >
              <ChevronLeft className="size-5" />
            </Link>
          )}
          <Link href="/" className="cord-wordmark min-w-0 truncate" aria-label="Drivecord, accueil">
            <span>Drive<Accent>cord</Accent></span>
            {section ? <span className="cord-section truncate">{section}</span> : null}
          </Link>
        </div>
      </header>
      <div
        className={cn("tabbar-pad relative z-[1] mx-auto flex w-full flex-1 flex-col gap-6 px-5 pb-20 pt-8 sm:px-6", width, className)}
      >
        {children}
      </div>
    </div>
  );
}

/** Le grand titre de page du kit, avec un mot en couleur, un chapeau et une action facultative. */
export function PageHeader({
  title,
  accent,
  kicker,
  lede,
  actions,
  icon,
}: {
  title: string;
  accent?: string;
  kicker?: string;
  lede?: React.ReactNode;
  actions?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <header className="space-y-3">
      {(kicker || icon) && (
        <p className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] text-[var(--cord-light-mid)]">
          {icon}
          {kicker}
        </p>
      )}
      <Headline text={title} accent={accent} className="text-[clamp(2rem,6.5vw,3.5rem)]" />
      {lede && <p className="cord-lede max-w-[60ch] !text-left">{lede}</p>}
      {actions && <div className="flex flex-wrap items-center gap-2 pt-1">{actions}</div>}
    </header>
  );
}
