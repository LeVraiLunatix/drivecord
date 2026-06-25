import type { Metadata } from "next";
import { Camera, ShieldCheck } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Coffre-fort",
  description:
    "Une section verrouillée par code PIN et Face ID pour tes fichiers les plus sensibles, chiffrée de bout en bout.",
};

export default function Page() {
  return (
    <DocPage
      title="Coffre-fort"
      lead="Une section à part, verrouillée par code PIN (et Face ID dans l'app), pour mettre tes fichiers les plus sensibles à l'abri des regards."
    >
      <DocH2>Une section cachée</DocH2>
      <p>
        Les fichiers placés dans le <strong>coffre-fort</strong>{" "}sont{" "}
        <strong>masqués de toutes les autres vues</strong>{" "}du drive : ils
        n&apos;apparaissent ni dans la liste principale, ni dans la recherche,
        ni dans les favoris. On ne les voit qu&apos;une fois le coffre
        déverrouillé.
      </p>

      <DocH2>Code PIN & Face ID</DocH2>
      <p>
        Le coffre est protégé par un <strong>code PIN</strong>{" "}que tu définis.
        Dans l&apos;app iOS, tu peux aussi le déverrouiller en{" "}
        <strong>Face ID / Touch ID</strong>{" "}pour plus de confort.
      </p>

      <DocH2>Re-verrouillage automatique</DocH2>
      <p>
        Dès que tu <strong>quittes la section</strong>, le coffre se{" "}
        <strong>re-verrouille tout seul</strong>. Pas de risque de le laisser
        ouvert par mégarde.
      </p>

      <Callout variant="info" title="Toujours chiffré de bout en bout">
        Le coffre s&apos;appuie sur le même chiffrement{" "}
        <code>AES-256-GCM</code>{" "}que le reste de Drivecord. Le code PIN protège
        l&apos;accès dans l&apos;interface ; le contenu, lui, reste chiffré côté
        client.
      </Callout>

      <DocH2>Voir aussi</DocH2>
      <CardGrid>
        <DocCard
          icon={Camera}
          title="Pellicule"
          href="/docs/utilisation/pellicule"
        >
          Sauvegarde tes photos et vidéos iPhone dans un drive.
        </DocCard>
        <DocCard
          icon={ShieldCheck}
          title="Sécurité & confidentialité"
          href="/docs/securite/chiffrement"
        >
          Le détail du chiffrement de bout en bout.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
