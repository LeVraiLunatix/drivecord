"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { getPager } from "@/lib/docs/nav";

/** Navigation « Précédent / Suivant » basée sur le parcours de lecture. */
export function DocsPager() {
  const pathname = usePathname();
  const { prev, next } = getPager(pathname);

  if (!prev && !next) return null;

  return (
    <nav className="mt-12 grid gap-3 border-t border-border/40 pt-6 sm:grid-cols-2">
      {prev ? (
        <Link
          href={prev.href}
          className="group flex flex-col gap-1 rounded-xl border border-border/50 p-4 transition-colors hover:border-primary/40 hover:bg-card/50"
        >
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeft className="size-3.5 transition-transform group-hover:-translate-x-0.5" />
            Précédent
          </span>
          <span className="font-medium text-foreground">{prev.title}</span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
      {next ? (
        <Link
          href={next.href}
          className="group flex flex-col items-end gap-1 rounded-xl border border-border/50 p-4 text-right transition-colors hover:border-primary/40 hover:bg-card/50"
        >
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            Suivant
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
          </span>
          <span className="font-medium text-foreground">{next.title}</span>
        </Link>
      ) : (
        <span className="hidden sm:block" />
      )}
    </nav>
  );
}
