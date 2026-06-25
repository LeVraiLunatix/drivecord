import type { Metadata } from "next";
import { BarChart3, Command } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Téléchargements",
  description:
    "Télécharge un fichier, ou un dossier entier en ZIP. Dans l'app iOS : médias vers la galerie, fichiers vers l'app Fichiers.",
};

export default function Page() {
  return (
    <DocPage
      title="Téléchargements"
      lead="Récupère un fichier seul, ou un dossier complet en archive ZIP — et dans l'app, tes médias vont droit dans la galerie."
    >
      <DocH2>Un fichier ou plusieurs</DocH2>
      <p>
        Un <strong>seul fichier</strong>{" "}se télécharge directement. Si tu en{" "}
        <strong>sélectionnes plusieurs</strong>, Drivecord les regroupe
        automatiquement dans une <strong>archive ZIP</strong>.
      </p>

      <DocH2>Un dossier entier en ZIP</DocH2>
      <p>
        Tu peux récupérer un <strong>dossier complet</strong>{" "}en une archive
        ZIP : l&apos;arborescence est conservée à l&apos;intérieur.
      </p>

      <DocH2>Dans l&apos;app iOS</DocH2>
      <p>Sur l&apos;app native, les téléchargements sont rangés intelligemment :</p>
      <ul>
        <li>
          <strong>Images et vidéos</strong>{" "}→ enregistrées dans ta{" "}
          <strong>galerie</strong>{" "}📸
        </li>
        <li>
          <strong>Autres fichiers</strong>{" "}→ dans l&apos;app{" "}
          <strong>Fichiers</strong>, dans un dossier <strong>Drivecord</strong>{" "}
          📁
        </li>
      </ul>

      <Callout variant="info" title="Reconstitué puis déchiffré localement">
        Au téléchargement, les chunks sont réassemblés et déchiffrés sur ton
        appareil. Un proxy interne rafraîchit au passage les liens
        d&apos;attachements Discord expirés.
      </Callout>

      <DocH2>Ensuite</DocH2>
      <CardGrid>
        <DocCard
          icon={BarChart3}
          title="Statistiques"
          href="/docs/utilisation/statistiques"
        >
          Types de fichiers, activité et top fichiers de ton drive.
        </DocCard>
        <DocCard
          icon={Command}
          title="Raccourcis & palette"
          href="/docs/utilisation/raccourcis"
        >
          Tout piloter au clavier avec la palette de commandes.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
