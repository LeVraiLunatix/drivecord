import type { Metadata } from "next";
import { Download, Share2 } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Aperçu des fichiers",
  description:
    "Visionne vidéos, PDF, audio, images, code et markdown directement dans l'app — même les .mov et .HEIC.",
};

export default function Page() {
  return (
    <DocPage
      title="Aperçu des fichiers"
      lead="Ouvre tes fichiers sans les télécharger : médias, documents, code et markdown s'affichent directement dans l'app."
    >
      <DocH2>Médias en streaming</DocH2>
      <p>
        <strong>Vidéos, audio, PDF et images</strong>{" "}se lisent directement dans
        une fenêtre d&apos;aperçu. Le contenu est <strong>streamé</strong>{" "}et
        déchiffré à la volée — pas besoin de tout télécharger d&apos;abord.
      </p>

      <DocH2>.mov et .HEIC</DocH2>
      <p>
        Les formats Apple récalcitrants sont gérés : les <code>.HEIC</code>{" "}
        (photos iPhone) et certains <code>.mov</code>{" "}sont{" "}
        <strong>convertis à la volée</strong>{" "}pour s&apos;afficher partout, même
        sur navigateur.
      </p>

      <Callout variant="info" title="Déchiffré dans ton appareil">
        L&apos;aperçu reconstitue le fichier <strong>localement</strong>{" "}à partir
        des chunks, puis le déchiffre. Rien n&apos;est déchiffré côté serveur.
      </Callout>

      <DocH2>Code & markdown</DocH2>
      <p>
        Les fichiers texte profitent d&apos;une{" "}
        <strong>coloration syntaxique</strong>, et les fichiers{" "}
        <code>.md</code>{" "}sont <strong>rendus en markdown</strong>{" "}(titres,
        listes, liens, tableaux…) directement dans l&apos;aperçu.
      </p>

      <DocH2>Ensuite</DocH2>
      <CardGrid>
        <DocCard
          icon={Download}
          title="Téléchargements"
          href="/docs/utilisation/telechargements"
        >
          Récupère un fichier ou un dossier entier en ZIP.
        </DocCard>
        <DocCard
          icon={Share2}
          title="Partage par lien"
          href="/docs/utilisation/partage"
        >
          Partage un aperçu public via un lien.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
