import type { Metadata } from "next";
import { Lock, Link2 } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { Steps, Step } from "@/components/docs/steps";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Partage par lien",
  description:
    "Partage un fichier via un lien public, avec mot de passe optionnel, date d'expiration et révocation.",
};

export default function Page() {
  return (
    <DocPage
      title="Partage par lien"
      lead="Génère un lien public vers un fichier, protégé par mot de passe et limité dans le temps si tu veux."
    >
      <DocH2>Créer un lien</DocH2>
      <Steps>
        <Step title="Ouvre le partage">
          Sur un fichier, choisis <strong>Partager par lien</strong>{" "}dans le menu
          d&apos;actions (⋮).
        </Step>
        <Step title="Règle les options">
          Mot de passe et expiration sont optionnels (voir ci-dessous).
        </Step>
        <Step title="Crée le lien">
          Clique sur <strong>Créer le lien</strong>, puis copie-le. Il pointe
          vers une page publique <code>/s/…</code>.
        </Step>
      </Steps>

      <DocH2>Les options</DocH2>
      <ul>
        <li>
          <strong>Mot de passe</strong>{" "}— optionnel. Laissé vide, le lien est
          public ; renseigné, il faut le saisir pour accéder au fichier.
        </li>
        <li>
          <strong>Expiration</strong>{" "}— <strong>Jamais</strong>,{" "}
          <strong>1 jour</strong>, <strong>7 jours</strong>{" "}ou{" "}
          <strong>30 jours</strong>. Passé ce délai, le lien ne fonctionne plus.
        </li>
      </ul>

      <Callout variant="warning" title="Le lien donne accès au fichier">
        Toute personne disposant du lien (et du mot de passe s&apos;il y en a un)
        peut voir et télécharger le fichier. Révoque-le dès qu&apos;il
        n&apos;est plus utile.
      </Callout>

      <DocH2>Gérer & révoquer</DocH2>
      <p>
        Depuis un lien existant tu peux l&apos;<strong>ouvrir</strong>{" "}dans un
        nouvel onglet ou le <strong>révoquer</strong>{" "}(il cesse alors
        immédiatement de fonctionner). La section{" "}
        <strong>Liens partagés</strong>{" "}regroupe tous tes partages au même
        endroit.
      </p>

      <DocH2>Ensuite</DocH2>
      <CardGrid>
        <DocCard
          icon={Lock}
          title="Coffre-fort"
          href="/docs/utilisation/coffre-fort"
        >
          Mets tes fichiers sensibles sous code PIN et Face ID.
        </DocCard>
        <DocCard
          icon={Link2}
          title="Sécurité & chiffrement"
          href="/docs/securite/chiffrement"
        >
          Comprends le modèle de chiffrement de bout en bout.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
