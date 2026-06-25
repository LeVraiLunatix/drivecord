import * as React from "react";
import { Prose } from "./prose";
import { Reveal } from "./reveal";

/**
 * Enveloppe standard d'une page de doc : titre, chapô, puis le corps en prose.
 * La table des matières scanne les `h2`/`h3` rendus à l'intérieur de `Prose`.
 */
export function DocPage({
  title,
  lead,
  children,
}: {
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <article>
      <Reveal>
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {title}
          </h1>
          {lead && (
            <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
              {lead}
            </p>
          )}
        </header>
      </Reveal>
      <Reveal delay={0.1}>
        <Prose>{children}</Prose>
      </Reveal>
    </article>
  );
}
