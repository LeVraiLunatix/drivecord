import type { Metadata } from "next";
import { Download, BarChart3 } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Pellicule",
  description:
    "Sauvegarde tes photos et vidéos iPhone dans un drive : tes albums deviennent des dossiers, avec un re-upload fiable.",
};

export default function Page() {
  return (
    <DocPage
      title="Pellicule"
      lead="Sauvegarde la pellicule de ton iPhone dans un drive Drivecord — tes albums deviennent des dossiers, automatiquement."
    >
      <Callout variant="info" title="Fonction de l'app iOS">
        La sauvegarde de la pellicule se fait depuis l&apos;<strong>app native
        iOS</strong>{" "}(accès à la photothèque). Pas encore installée ?{" "}
        <a href="/docs/prise-en-main/installer-l-app">Voir l&apos;installation</a>.
      </Callout>

      <DocH2>Sauvegarder tes photos & vidéos</DocH2>
      <p>
        Depuis l&apos;onglet <strong>Pellicule</strong>, choisis un drive de
        destination : Drivecord y envoie tes <strong>photos et vidéos</strong>,
        chiffrées comme n&apos;importe quel autre fichier.
      </p>

      <DocH2>Tes albums deviennent des dossiers</DocH2>
      <p>
        L&apos;organisation de ta photothèque est respectée : chaque{" "}
        <strong>album</strong>{" "}de l&apos;iPhone est recréé comme un{" "}
        <strong>dossier</strong>{" "}dans ton drive.
      </p>

      <DocH2>Re-upload fiable</DocH2>
      <p>
        La sauvegarde est conçue pour les <strong>gros volumes</strong>{" "}: plus de
        plantage mémoire sur les grandes vidéos, suivi de progression{" "}
        <strong>synchronisé avec le drive</strong>, et reprise sans recréer de
        doublons.
      </p>

      <DocH2>Ensuite</DocH2>
      <CardGrid>
        <DocCard
          icon={Download}
          title="Téléchargements"
          href="/docs/utilisation/telechargements"
        >
          Récupère tes médias dans la galerie ou l&apos;app Fichiers.
        </DocCard>
        <DocCard
          icon={BarChart3}
          title="Statistiques"
          href="/docs/utilisation/statistiques"
        >
          Visualise la répartition et l&apos;activité de ton drive.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
