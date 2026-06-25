import type { Metadata } from "next";
import { Eye, Share2 } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Organiser ses fichiers",
  description:
    "Dossiers, tags colorés, favoris, recherche instantanée et déplacement : garde ton drive bien rangé.",
};

export default function Page() {
  return (
    <DocPage
      title="Organiser ses fichiers"
      lead="Dossiers, tags colorés, favoris et recherche instantanée : tout pour garder un drive bien rangé."
    >
      <DocH2>Dossiers</DocH2>
      <p>
        Crée des <strong>dossiers</strong>{" "}et imbrique-les autant que tu veux.
        Le <strong>fil d&apos;Ariane</strong>{" "}en haut te situe toujours dans
        l&apos;arborescence, et tu peux remonter d&apos;un clic.
      </p>

      <DocH2>Tags colorés</DocH2>
      <p>
        Attribue des <strong>tags colorés</strong>{" "}à tes fichiers pour les
        regrouper par thème, indépendamment des dossiers. Filtre ensuite ton
        drive par tag pour retrouver tout ce qui s&apos;y rapporte.
      </p>

      <DocH2>Favoris</DocH2>
      <p>
        Mets une <strong>étoile</strong>{" "}sur tes fichiers importants : ils
        apparaissent dans une section <strong>Favoris</strong>{" "}dédiée, toujours à
        portée de main.
      </p>

      <DocH2>Recherche</DocH2>
      <p>
        La <strong>recherche est instantanée</strong>{" "}: commence à taper et la
        liste se filtre en temps réel. Combine-la avec la{" "}
        <a href="/docs/utilisation/raccourcis">palette de commandes</a>{" "}pour aller
        encore plus vite.
      </p>

      <DocH2>Déplacer & renommer</DocH2>
      <p>
        Déplace tes fichiers et dossiers d&apos;un endroit à l&apos;autre, ou
        renomme-les à tout moment. La sélection multiple permet d&apos;agir sur
        plusieurs éléments en une fois.
      </p>

      <Callout variant="tip" title="Sélection multiple">
        Active le mode <strong>Sélectionner</strong>{" "}pour cocher plusieurs
        fichiers (ou « Tout sélectionner ») et les déplacer, taguer ou
        télécharger ensemble.
      </Callout>

      <DocH2>Pour aller plus loin</DocH2>
      <CardGrid>
        <DocCard
          icon={Eye}
          title="Aperçu des fichiers"
          href="/docs/utilisation/apercu"
        >
          Visionne médias, PDF, code et markdown directement dans l&apos;app.
        </DocCard>
        <DocCard
          icon={Share2}
          title="Partage par lien"
          href="/docs/utilisation/partage"
        >
          Génère un lien public protégé par mot de passe.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
