import type { Metadata } from "next";
import { FolderTree, Share2 } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Envoyer des fichiers",
  description:
    "Glisser-déposer, découpage en chunks et upload parallèle : envoie tes fichiers sans limite de taille.",
};

export default function Page() {
  return (
    <DocPage
      title="Envoyer des fichiers"
      lead="Glisse tes fichiers, ils sont chiffrés puis découpés et envoyés en parallèle sur ton webhook — sans limite de taille."
    >
      <DocH2>Glisser-déposer</DocH2>
      <p>
        Dans ton drive, tu peux <strong>glisser-déposer</strong>{" "}des fichiers
        n&apos;importe où dans la fenêtre, ou utiliser le bouton{" "}
        <strong>Uploader</strong>{" "}pour ouvrir le sélecteur de fichiers. Plusieurs
        fichiers à la fois, c&apos;est pris en charge.
      </p>

      <DocH2>Découpage en chunks</DocH2>
      <p>
        Discord limite la taille d&apos;un message. Drivecord contourne ça en{" "}
        <strong>découpant chaque fichier en morceaux</strong>{" "}(<em>chunks</em>)
        envoyés <strong>en parallèle</strong>. Résultat : des transferts rapides
        et <strong>aucune limite de taille</strong>.
      </p>

      <Callout variant="info" title="Chiffré avant l'envoi">
        Le chiffrement <code>AES-256-GCM</code>{" "}a lieu sur ton appareil{" "}
        <strong>avant</strong>{" "}le découpage. Discord ne reçoit que des morceaux
        déjà illisibles.
      </Callout>

      <DocH2>Import de dossiers</DocH2>
      <p>
        Tu peux importer un <strong>dossier entier</strong>{" "}: son arborescence
        est recréée à l&apos;identique dans ton drive, sous-dossiers compris.
      </p>

      <DocH3>Suivi de l&apos;upload</DocH3>
      <p>
        Une <strong>file d&apos;attente</strong>{" "}s&apos;affiche pendant
        l&apos;envoi : tu vois la progression fichier par fichier et tu peux
        continuer à naviguer dans l&apos;app pendant ce temps.
      </p>

      <DocH2>Et ensuite</DocH2>
      <CardGrid>
        <DocCard
          icon={FolderTree}
          title="Organiser ses fichiers"
          href="/docs/utilisation/organiser"
        >
          Dossiers, tags colorés, favoris et recherche instantanée.
        </DocCard>
        <DocCard
          icon={Share2}
          title="Partage par lien"
          href="/docs/utilisation/partage"
        >
          Partage un fichier avec mot de passe et date d&apos;expiration.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
