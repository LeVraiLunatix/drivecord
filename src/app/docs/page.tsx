import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";
import { Reveal } from "@/components/docs/reveal";
import { docsNav, firstReady } from "@/lib/docs/nav";

export const metadata: Metadata = {
  title: "Documentation",
  description:
    "Tout pour prendre en main Drivecord : installation, utilisation au quotidien, sécurité et auto-hébergement.",
};

const SECTION_DESC: Record<string, string> = {
  "Prise en main":
    "Crée ton compte, branche un webhook Discord et installe l'app iPhone.",
  Utilisation:
    "Upload, dossiers, tags, partage par lien, coffre-fort, pellicule et stats.",
  "Sécurité & confidentialité":
    "Chiffrement de bout en bout, ce que Discord voit réellement, bonnes pratiques.",
  "Technique & self-host":
    "Fonctionnement interne, architecture de la stack et auto-hébergement.",
  Aide: "Questions fréquentes et résolution des problèmes courants.",
};

export default function DocsHome() {
  return (
    <div>
      <Reveal>
        <header className="mb-10">
          <p className="mb-2 font-mono text-xs uppercase tracking-widest text-muted-foreground">
            Documentation
          </p>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Bienvenue dans la doc Drivecord
          </h1>
          <p className="mt-3 max-w-2xl text-lg leading-relaxed text-muted-foreground">
            Ton cloud illimité propulsé par Discord — chiffré de bout en bout,
            sans serveur de fichiers et sans abonnement. Voici tout ce qu'il faut
            pour bien démarrer.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button asChild className="gap-2">
              <Link href="/docs/prise-en-main/presentation">
                Commencer
                <ArrowRight className="size-4" />
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/install">Installer l&apos;app iPhone</Link>
            </Button>
          </div>
        </header>
      </Reveal>

      <CardGrid>
        {docsNav.map((section, i) => {
          const target = firstReady(section);
          return (
            <Reveal key={section.title} delay={0.06 * i} className="h-full">
              <DocCard
                icon={section.icon}
                title={section.title}
                href={target?.href ?? "#"}
                disabled={!target}
              >
                {SECTION_DESC[section.title]}
              </DocCard>
            </Reveal>
          );
        })}
      </CardGrid>
    </div>
  );
}
