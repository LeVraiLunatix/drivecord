import type { Metadata } from "next";
import { KeyRound, FolderTree } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { Steps, Step } from "@/components/docs/steps";
import { CodeBlock } from "@/components/docs/code-block";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Connecter un webhook Discord",
  description:
    "Crée un webhook Discord et branche-le à Drivecord : c'est lui qui stocke réellement tes fichiers.",
};

export default function Page() {
  return (
    <DocPage
      title="Connecter un webhook Discord"
      lead="Le webhook est le cœur de Drivecord : c'est lui qui stocke réellement tes fichiers. Voici comment en créer un et le brancher en deux minutes."
    >
      <DocH2>Pourquoi un webhook ?</DocH2>
      <p>
        Discord héberge gratuitement les pièces jointes envoyées dans un salon.
        Un <strong>webhook</strong>{" "}est une URL qui permet d'y publier des
        messages sans bot. Drivecord s'en sert comme d'un disque dur : c'est ta{" "}
        <strong>clé d'accès au stockage</strong>.
      </p>
      <p>
        Quand tu colles l'URL, Drivecord la <strong>hashe localement</strong>{" "}
        pour identifier ton drive. L'URL en clair ne quitte jamais ton appareil
        (sauf si tu actives la synchronisation via un{" "}
        <a href="/docs/prise-en-main/compte">compte</a>, qui la chiffre).
      </p>

      <Callout variant="warning" title="Garde cette URL secrète">
        Quiconque possède l'URL du webhook peut écrire dans ton salon. Ne la
        partage pas et utilise un salon (idéalement un serveur) dédié.
      </Callout>

      <DocH2>Créer le webhook</DocH2>
      <Steps>
        <Step title="Crée un serveur Discord privé">
          Ou utilises-en un dont tu es administrateur. C'est là que tes fichiers
          chiffrés seront stockés.
        </Step>
        <Step title="Crée un salon dédié">
          Par exemple <code>#drivecord-storage</code>, pour ne pas mélanger avec
          tes discussions.
        </Step>
        <Step title="Ouvre les webhooks du salon">
          <strong>
            Paramètres du salon → Intégrations → Webhooks → Nouveau webhook
          </strong>
          . Aucun bot n'est nécessaire.
        </Step>
        <Step title="Copie l'URL">
          Clique sur <strong>Copier l'URL du webhook</strong>. Elle ressemble à
          ceci :
        </Step>
      </Steps>

      <CodeBlock language="URL de webhook">{`https://discord.com/api/webhooks/123456789012345678/aBcDeFgHiJkLmNoPqRsTuVwXyZ...`}</CodeBlock>

      <p>
        Besoin de plus de détails côté Discord ?{" "}
        <a
          href="https://support.discord.com/hc/fr/articles/228383668"
          target="_blank"
          rel="noopener noreferrer"
        >
          Guide officiel des webhooks
        </a>
        .
      </p>

      <DocH2>Le brancher à Drivecord</DocH2>
      <Steps>
        <Step title="Ouvre la page de configuration">
          Rends-toi sur <a href="/setup">la page « Connecter un webhook »</a>{" "}de
          l'app.
        </Step>
        <Step title="Colle l'URL">
          Colle l'URL copiée dans le champ, puis valide.
        </Step>
        <Step title="C'est prêt">
          Ton drive s'ouvre. Tu peux commencer à glisser des fichiers — ils sont
          chiffrés puis uploadés automatiquement.
        </Step>
      </Steps>

      <Callout variant="info" title="Où sont stockés mes drives ?">
        Les métadonnées (arborescence, références de chunks) vivent{" "}
        <strong>localement</strong>{" "}dans ton navigateur (IndexedDB). Crée un
        compte pour les sauvegarder et les retrouver sur tous tes appareils.
      </Callout>

      <DocH3>Plusieurs drives</DocH3>
      <p>
        Tu peux connecter <strong>plusieurs webhooks</strong>{" "}: chacun devient un
        drive indépendant, et tu passes de l'un à l'autre depuis le sélecteur de
        drive dans la barre latérale.
      </p>

      <Callout variant="warning" title="Conditions d'utilisation de Discord">
        Stocker des fichiers arbitraires via les webhooks peut entrer en tension
        avec les CGU de Discord. Utilise Drivecord de façon responsable et à tes
        risques.
      </Callout>

      <DocH2>Étapes suivantes</DocH2>
      <CardGrid>
        <DocCard
          icon={KeyRound}
          title="Créer un compte"
          href="/docs/prise-en-main/compte"
        >
          Sauvegarde et synchronise tes webhooks sur tous tes appareils.
        </DocCard>
        <DocCard
          icon={FolderTree}
          title="Installer l'app iPhone"
          href="/docs/prise-en-main/installer-l-app"
        >
          Une vraie app native iOS, avec Face ID et sauvegarde dans la pellicule.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
