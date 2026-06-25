import type { Metadata } from "next";
import { Command, Webhook } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Statistiques",
  description:
    "Une vue d'ensemble de ton drive : répartition par type de fichier, activité dans le temps et top fichiers.",
};

export default function Page() {
  return (
    <DocPage
      title="Statistiques"
      lead="Une page dédiée pour visualiser d'un coup d'œil ce que contient ton drive et comment tu l'utilises."
    >
      <DocH2>Vue d&apos;ensemble</DocH2>
      <p>
        La page <strong>Statistiques</strong>{" "}résume ton drive : nombre de
        fichiers, espace occupé et grandes tendances, sans avoir à fouiller dans
        les dossiers.
      </p>

      <DocH2>Répartition par type</DocH2>
      <p>
        Vois comment se répartissent tes fichiers par <strong>type</strong>{" "}
        (images, vidéos, documents, audio…) pour comprendre ce qui occupe le plus
        de place.
      </p>

      <DocH2>Activité & top fichiers</DocH2>
      <p>
        Suis l&apos;<strong>activité</strong>{" "}de ton drive dans le temps et
        repère tes <strong>plus gros fichiers</strong>{" "}en un coup d&apos;œil —
        pratique pour faire le ménage.
      </p>

      <DocH2>Ensuite</DocH2>
      <CardGrid>
        <DocCard
          icon={Command}
          title="Raccourcis & palette"
          href="/docs/utilisation/raccourcis"
        >
          Ouvre les stats (et tout le reste) au clavier avec ⌘K.
        </DocCard>
        <DocCard
          icon={Webhook}
          title="Comment marche le stockage"
          href="/docs/technique/fonctionnement"
        >
          Le détail technique derrière les chiffres.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
