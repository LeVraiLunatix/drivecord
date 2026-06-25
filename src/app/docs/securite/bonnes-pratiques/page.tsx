import type { Metadata } from "next";
import { Webhook, Lock } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Bonnes pratiques",
  description:
    "Quelques réflexes simples pour garder tes fichiers vraiment privés avec Drivecord.",
};

export default function Page() {
  return (
    <DocPage
      title="Bonnes pratiques"
      lead="Quelques réflexes simples pour tirer le meilleur de la sécurité de Drivecord."
    >
      <DocH2>Garde ton webhook secret</DocH2>
      <p>
        L&apos;URL du webhook est la <strong>clé d&apos;accès</strong>{" "}à ton drive :
        quiconque la possède peut écrire dans ton salon. Ne la partage pas, et
        utilise un <strong>serveur Discord privé</strong>{" "}avec un salon dédié.
      </p>

      <DocH2>Mets le sensible au coffre</DocH2>
      <p>
        Pour les fichiers vraiment confidentiels, range-les dans le{" "}
        <a href="/docs/utilisation/coffre-fort">coffre-fort</a>{" "}: c&apos;est le seul
        tier que <strong>même le serveur ne peut pas lire</strong>.
      </p>

      <DocH2>Des secrets solides</DocH2>
      <p>
        Choisis un <strong>mot de passe</strong>{" "}de compte robuste et un{" "}
        <strong>code PIN</strong>{" "}de coffre que tu n&apos;utilises nulle part
        ailleurs. Le PIN ne peut pas être réinitialisé sans perdre l&apos;accès au
        coffre — note-le en lieu sûr.
      </p>

      <DocH2>Partage avec discernement</DocH2>
      <p>
        Un lien de partage donne accès au fichier. Mets un{" "}
        <strong>mot de passe</strong>{" "}et une <strong>date d&apos;expiration</strong>,
        et <strong>révoque</strong>{" "}le lien dès qu&apos;il n&apos;est plus utile.
      </p>

      <Callout variant="warning" title="Reste responsable">
        Drivecord s&apos;appuie sur Discord. N&apos;y stocke rien d&apos;illégal ou
        d&apos;abusif : tu restes responsable de tes fichiers, et le stockage via
        webhooks peut entrer en tension avec les CGU de Discord.
      </Callout>

      <DocH2>Pour aller plus loin</DocH2>
      <CardGrid>
        <DocCard
          icon={Webhook}
          title="Comment marche le stockage"
          href="/docs/technique/fonctionnement"
        >
          Le fonctionnement interne, des chunks au proxy.
        </DocCard>
        <DocCard
          icon={Lock}
          title="Chiffrement de bout en bout"
          href="/docs/securite/chiffrement"
        >
          Le modèle de clés en détail.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
