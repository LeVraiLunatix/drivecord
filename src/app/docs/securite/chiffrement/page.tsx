import type { Metadata } from "next";
import { Eye, Lock } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Chiffrement de bout en bout",
  description:
    "Comment Drivecord chiffre tes fichiers (AES-256-GCM), avec quelles clés, et ce que ça protège réellement.",
};

export default function Page() {
  return (
    <DocPage
      title="Chiffrement de bout en bout"
      lead="Comment Drivecord chiffre tes fichiers, avec quelles clés, et — surtout — ce que ça protège vraiment."
    >
      <DocH2>Le principe</DocH2>
      <p>
        Quand tu es connecté, <strong>chaque fichier</strong>{" "}que tu envoies est
        chiffré en <code>AES-256-GCM</code> <strong>sur ton appareil</strong>,
        avant d&apos;être découpé et envoyé sur Discord. Discord ne reçoit donc
        que des octets <strong>illisibles</strong>.
      </p>

      <DocH2>Deux niveaux de clés</DocH2>
      <DocH3>La clé du drive</DocH3>
      <p>
        Chaque drive a une <strong>clé aléatoire</strong>{" "}qui chiffre tous ses
        fichiers normaux. Elle est <strong>stockée chiffrée sur ton compte</strong>
        {" "}(pour se synchroniser entre tes appareils), jamais en clair sur
        Discord.
      </p>
      <DocH3>La clé du coffre-fort</DocH3>
      <p>
        Les fichiers du <a href="/docs/utilisation/coffre-fort">coffre-fort</a>{" "}
        utilisent une clé <strong>dérivée de ton code PIN</strong>{" "}(PBKDF2). Cette
        clé ne quitte <strong>jamais</strong>{" "}ton appareil — personne d&apos;autre
        ne peut la recalculer sans ton PIN.
      </p>

      <DocH2>Qui peut déchiffrer quoi</DocH2>
      <ul>
        <li>
          <strong>Discord</strong>{" "}: rien. Il ne stocke que du chiffré.
        </li>
        <li>
          <strong>Toi (connecté)</strong>{" "}: tout — tu as les deux clés.
        </li>
        <li>
          <strong>Le serveur Drivecord</strong>{" "}: il détient ta clé de drive
          (chiffrée au repos), donc il <em>pourrait techniquement</em>{" "}déchiffrer
          tes fichiers normaux. En revanche il ne peut <strong>jamais</strong>{" "}
          lire ton coffre-fort (il n&apos;a pas ton PIN).
        </li>
      </ul>

      <Callout variant="warning" title="Sois lucide sur le modèle">
        Le <strong>coffre-fort</strong>{" "}est du vrai E2EE absolu : ni Discord ni le
        serveur ne peuvent le lire. Les <strong>fichiers normaux</strong>{" "}sont
        chiffrés (forts contre Discord et les tiers), mais comme leur clé est
        sauvegardée sur ton compte, le serveur pourrait techniquement les
        déchiffrer. Pour le plus sensible : utilise le coffre.
      </Callout>

      <DocH2>Et le webhook ?</DocH2>
      <p>
        L&apos;URL de ton webhook est <strong>hashée localement</strong>{" "}
        (SHA-256) pour identifier ton drive, et sa copie de sauvegarde est{" "}
        <strong>chiffrée sur le serveur</strong>. Un vol de la base ne donne donc
        ni webhooks fonctionnels, ni contenu lisible.
      </p>

      <DocH2>Pour aller plus loin</DocH2>
      <CardGrid>
        <DocCard
          icon={Eye}
          title="Ce que Discord voit"
          href="/docs/securite/confidentialite"
        >
          Le détail de ce que Discord et le serveur savent (et ne savent pas).
        </DocCard>
        <DocCard
          icon={Lock}
          title="Coffre-fort"
          href="/docs/utilisation/coffre-fort"
        >
          Le tier le plus sûr, déchiffrable par toi seul.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
