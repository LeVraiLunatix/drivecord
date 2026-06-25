import type { Metadata } from "next";
import { Upload, Compass } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { Kbd } from "@/components/docs/kbd";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Raccourcis & palette",
  description:
    "La palette de commandes (Ctrl/Cmd+K) pour tout piloter au clavier : upload, navigation, drives, thème…",
};

export default function Page() {
  return (
    <DocPage
      title="Raccourcis & palette de commandes"
      lead="Une palette de commandes à la VS Code pour tout faire au clavier, sans lâcher le flux."
    >
      <DocH2>Ouvrir la palette</DocH2>
      <p>
        Appuie sur <Kbd>Ctrl</Kbd> <Kbd>K</Kbd> (ou <Kbd>⌘</Kbd> <Kbd>K</Kbd> sur
        Mac) n&apos;importe où dans l&apos;app pour ouvrir la{" "}
        <strong>palette de commandes</strong>. Commence à taper pour filtrer.
      </p>

      <DocH2>Ce que tu peux faire</DocH2>
      <ul>
        <li>
          <strong>Actions</strong>{" "}— uploader des fichiers, créer un dossier,
          ajouter un drive.
        </li>
        <li>
          <strong>Aller à</strong>{" "}— tous les fichiers, favoris, corbeille,
          statistiques, liens partagés, paramètres, sauvegarde pellicule,
          page d&apos;installation.
        </li>
        <li>
          <strong>Drives</strong>{" "}— basculer instantanément d&apos;un drive à
          l&apos;autre.
        </li>
        <li>
          <strong>Préférences</strong>{" "}— basculer le thème clair / sombre.
        </li>
        <li>
          <strong>Compte</strong>{" "}— se déconnecter.
        </li>
      </ul>

      <DocH3>Navigation au clavier</DocH3>
      <p>
        Déplace-toi avec <Kbd>↑</Kbd> <Kbd>↓</Kbd>, valide avec{" "}
        <Kbd>Entrée</Kbd>, et ferme la palette avec <Kbd>Échap</Kbd>. La
        recherche est tolérante : tape des mots-clés, pas forcément le libellé
        exact.
      </p>

      <Callout variant="tip" title="Le réflexe à prendre">
        Besoin d&apos;une action ? <Kbd>⌘</Kbd> <Kbd>K</Kbd>, tu tapes les
        premières lettres, <Kbd>Entrée</Kbd>. Plus rapide que de chercher le bon
        bouton.
      </Callout>

      <DocH2>Ensuite</DocH2>
      <CardGrid>
        <DocCard
          icon={Upload}
          title="Envoyer des fichiers"
          href="/docs/utilisation/envoyer-des-fichiers"
        >
          Upload par glisser-déposer et découpage en chunks.
        </DocCard>
        <DocCard
          icon={Compass}
          title="Comment marche le stockage"
          href="/docs/technique/fonctionnement"
        >
          Plonge dans le fonctionnement interne de Drivecord.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
