import type { Metadata } from "next";
import { ShieldCheck, KeyRound } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Comptes & connexion",
  description:
    "Comment fonctionne la connexion à Drivecord, et pourquoi le chiffrement de tes fichiers a besoin d'un compte.",
};

export default function Page() {
  return (
    <DocPage
      title="Comptes & connexion"
      lead="Comment ton compte protège tes accès — et pourquoi le chiffrement en dépend."
    >
      <DocH2>Se connecter</DocH2>
      <p>
        Trois méthodes, toutes gratuites : <strong>email + mot de passe</strong>,
        <strong>Google</strong>{" "}ou <strong>Discord</strong>. Les mots de passe
        sont <strong>hashés en bcrypt</strong>{" "}— jamais stockés en clair.
      </p>

      <DocH2>Pourquoi le chiffrement nécessite un compte</DocH2>
      <p>
        La clé qui chiffre tes fichiers est <strong>sauvegardée sur ton compte</strong>
        {" "}(chiffrée). C&apos;est ce qui te permet de relire tes fichiers sur un
        autre appareil. Sans compte, cette clé n&apos;existerait qu&apos;en local —
        et si ton navigateur était effacé, tes fichiers deviendraient{" "}
        <strong>illisibles pour toujours</strong>.
      </p>
      <Callout variant="info" title="C'est un choix de sécurité">
        Pour éviter ce risque de perte de données, Drivecord ne chiffre que si tu
        es connecté. Sans compte, les fichiers restent en clair (comme avant).
      </Callout>

      <DocH2>Le code PIN du coffre</DocH2>
      <p>
        Le coffre-fort est protégé par un <strong>code PIN</strong>{" "}distinct de ton
        mot de passe. Son empreinte est hashée côté serveur, mais la{" "}
        <strong>clé de déchiffrement</strong>{" "}qui en dérive ne quitte jamais ton
        appareil — le serveur ne peut donc pas ouvrir ton coffre.
      </p>

      <DocH2>Pour aller plus loin</DocH2>
      <CardGrid>
        <DocCard
          icon={KeyRound}
          title="Chiffrement de bout en bout"
          href="/docs/securite/chiffrement"
        >
          Le détail des clés et de ce qu&apos;elles protègent.
        </DocCard>
        <DocCard
          icon={ShieldCheck}
          title="Bonnes pratiques"
          href="/docs/securite/bonnes-pratiques"
        >
          Les réflexes à adopter au quotidien.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
