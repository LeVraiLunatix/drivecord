import * as React from "react";
import { Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { slugify } from "@/lib/docs/nav";

/**
 * Conteneur typographique des pages de doc. Les styles des éléments enfants
 * (p, ul, code, a…) vivent dans `globals.css` sous `.docs-prose`.
 */
export function Prose({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("docs-prose", className)} {...props} />;
}

/** Titre de section avec id d'ancre (alimente la table des matières). */
export function DocH2({ children }: { children: string }) {
  const id = slugify(children);
  return (
    <h2 id={id} className="group scroll-mt-24">
      {children}
      <AnchorLink id={id} />
    </h2>
  );
}

/** Sous-titre avec id d'ancre. */
export function DocH3({ children }: { children: string }) {
  const id = slugify(children);
  return (
    <h3 id={id} className="group scroll-mt-24">
      {children}
      <AnchorLink id={id} />
    </h3>
  );
}

function AnchorLink({ id }: { id: string }) {
  return (
    <a
      href={`#${id}`}
      aria-label="Lien direct vers cette section"
      className="ml-2 inline-flex translate-y-px text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
    >
      <Link2 className="size-4" />
    </a>
  );
}
