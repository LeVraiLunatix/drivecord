import type { Metadata } from "next";
import { Smartphone, UserPlus } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { Steps, Step } from "@/components/docs/steps";
import { CodeBlock } from "@/components/docs/code-block";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";
import { Kbd } from "@/components/docs/kbd";

export const metadata: Metadata = {
  title: "Présentation",
  description:
    "Drivecord transforme un simple webhook Discord en cloud personnel, chiffré et illimité.",
};

export default function Page() {
  return (
    <DocPage
      title="Présentation"
      lead="Drivecord transforme un simple webhook Discord en cloud personnel : chiffré de bout en bout, illimité et sans serveur de fichiers."
    >
      <p>
        Drivecord est un clone moderne et amélioré de{" "}
        <a
          href="https://github.com/DisboxApp/disbox"
          target="_blank"
          rel="noopener noreferrer"
        >
          Disbox
        </a>
        . L&apos;idée est simple : Discord héberge gratuitement les pièces
        jointes, alors on s&apos;en sert comme d&apos;un disque dur en ligne —
        mais en chiffrant tout <strong>avant</strong>{" "}que ça ne quitte ton
        appareil.
      </p>

      <DocH2>Pourquoi Drivecord</DocH2>
      <ul>
        <li>
          <strong>Stockage illimité</strong>{" "}— les fichiers sont découpés en{" "}
          <em>chunks</em>{" "}et envoyés en parallèle, ce qui dépasse la limite de
          taille d&apos;un message Discord.
        </li>
        <li>
          <strong>Chiffrement E2EE</strong>{" "}— un coffre chiffré en{" "}
          <code>AES-256-GCM</code>{" "}côté client : Discord ne voit que des blocs
          illisibles.
        </li>
        <li>
          <strong>Partage avancé</strong>{" "}— liens publics avec mot de passe,
          date d&apos;expiration et compteur de téléchargements.
        </li>
        <li>
          <strong>App native iOS</strong>{" "}— vraie app installable, avec Face ID
          et sauvegarde dans la pellicule.
        </li>
      </ul>

      <Callout variant="info" title="Aucun serveur de fichiers à payer">
        Il n&apos;y a pas de stockage à héberger : tes octets vivent sur Discord.
        Drivecord ne gère que les métadonnées (l&apos;arborescence, les
        références de chunks) et l&apos;interface.
      </Callout>

      <DocH2>Comment ça marche</DocH2>
      <p>En trois temps :</p>
      <Steps>
        <Step title="Crée un webhook Discord">
          Dans un salon : <strong>Paramètres → Intégrations → Webhooks</strong>.
          C&apos;est gratuit et aucun bot n&apos;est nécessaire.
        </Step>
        <Step title="Connecte-le à Drivecord">
          L&apos;URL du webhook est <strong>hashée localement</strong>{" "}pour
          identifier ton drive. Elle n&apos;est jamais envoyée en clair à un
          serveur tiers.
        </Step>
        <Step title="Envoie et partage">
          Glisse tes fichiers : ils sont chiffrés, découpés, puis uploadés. Au
          téléchargement, un proxy interne rafraîchit les liens expirés.
        </Step>
      </Steps>

      <p>Le trajet complet d&apos;un fichier ressemble à ceci :</p>
      <CodeBlock language="Le voyage d'un fichier">{`Fichier  ─▶  chiffrement AES-256-GCM  ─▶  découpage en chunks  ─▶  POST webhook
   ▲                                                                     │
   │                                                                     ▼
déchiffrement  ◀──  réassemblage  ◀──  proxy anti-expiration  ◀──  Discord stocke`}</CodeBlock>

      <DocH2>Et la vie privée ?</DocH2>
      <p>
        Comme le chiffrement a lieu sur ton appareil, Discord (et n&apos;importe
        qui interceptant le trafic) ne récupère que des données chiffrées. La
        clé, elle, ne quitte jamais ton navigateur.
      </p>
      <Callout variant="warning" title="Conditions d'utilisation de Discord">
        Stocker des fichiers arbitraires via les webhooks peut entrer en tension
        avec les CGU de Discord. Drivecord est un projet personnel et éducatif —
        utilise-le de façon responsable et à tes risques.
      </Callout>

      <DocH3>Un raccourci à connaître</DocH3>
      <p>
        Dans l&apos;app, ouvre la palette de commandes avec <Kbd>Ctrl</Kbd>{" "}
        <Kbd>K</Kbd> (ou <Kbd>⌘</Kbd> <Kbd>K</Kbd>) pour tout faire au clavier :
        rechercher, créer un dossier, changer de drive…
      </p>

      <DocH2>Par où commencer</DocH2>
      <CardGrid>
        <DocCard icon={Smartphone} title="Installer l'app iPhone" href="/install">
          Sideloade Drivecord via AltStore ou Sideloadly, avec mises à jour
          automatiques.
        </DocCard>
        <DocCard
          icon={UserPlus}
          title="Créer un compte"
          href="/docs/prise-en-main/compte"
        >
          Email, Google ou Discord — une couche optionnelle pour synchroniser tes
          webhooks sur tous tes appareils.
        </DocCard>
      </CardGrid>

      <Callout variant="tip">
        Pressé ? L&apos;essentiel tient en une phrase : crée un webhook, colle-le
        dans Drivecord, glisse tes fichiers. Le reste de cette doc détaille
        chaque fonctionnalité.
      </Callout>
    </DocPage>
  );
}
