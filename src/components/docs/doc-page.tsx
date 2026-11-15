import * as React from "react";
import { Prose } from "./prose";
import { Reveal } from "./reveal";
import { Headline } from "@/kitcord";

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
          <Headline text={title} className="text-[clamp(2rem,5.5vw,3.25rem)]" />
          {lead && (
            <p className="cord-lede mt-4 !text-left">
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
