import type { Metadata } from "next";
import { Webhook, Smartphone } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { Steps, Step } from "@/components/docs/steps";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Créer un compte",
  description:
    "Un compte Drivecord est optionnel : il sert à sauvegarder et synchroniser tes webhooks sur tous tes appareils.",
};

export default function Page() {
  return (
    <DocPage
      title="Créer un compte"
      lead="Un compte est optionnel : il sert à sauvegarder et synchroniser tes webhooks (donc tes drives) sur tous tes appareils."
    >
      <DocH2>À quoi sert un compte ?</DocH2>
      <p>
        Il faut bien distinguer deux choses dans Drivecord :
      </p>
      <ul>
        <li>
          Le <strong>webhook Discord</strong>{" "}— c'est lui qui stocke réellement
          tes fichiers. Sans webhook, pas de drive.
        </li>
        <li>
          Le <strong>compte</strong>{" "}(email, Google ou Discord) — une couche{" "}
          <strong>facultative</strong>{" "}qui sauvegarde la liste de tes webhooks
          et la synchronise entre ton navigateur et l'app iPhone.
        </li>
      </ul>

      <Callout variant="info" title="Utilisable sans compte">
        Tu peux très bien utiliser Drivecord sans créer de compte : tes drives
        sont alors simplement stockés en local dans ton navigateur. Le compte
        sert uniquement à les retrouver ailleurs.
      </Callout>

      <DocH2>Les trois méthodes</DocH2>
      <p>
        Tu peux créer ton compte de trois façons, toutes gratuites :
      </p>

      <DocH3>Email & mot de passe</DocH3>
      <Steps>
        <Step title="Ouvre la page d'inscription">
          Depuis l'accueil ou l'app : <a href="/register">Créer un compte</a>.
        </Step>
        <Step title="Renseigne tes infos">
          Un nom (optionnel), ton email et un mot de passe d'au moins{" "}
          <strong>8 caractères</strong>, puis confirme-le.
        </Step>
        <Step title="Valide">
          Clique sur <strong>Créer mon compte</strong>{" "}: tu es connecté
          automatiquement et redirigé vers ton drive.
        </Step>
      </Steps>

      <DocH3>Google ou Discord</DocH3>
      <p>
        Plus rapide : clique sur <strong>Continuer avec Google</strong>{" "}ou{" "}
        <strong>Continuer avec Discord</strong>. Un seul clic, aucun mot de passe
        à retenir.
      </p>

      <Callout variant="tip" title="Dans l'app iPhone">
        La connexion Google/Discord ouvre ton navigateur (pour que les passkeys
        et la biométrie fonctionnent), puis te ramène automatiquement dans l'app,
        connecté.
      </Callout>

      <DocH2>Étapes suivantes</DocH2>
      <CardGrid>
        <DocCard
          icon={Webhook}
          title="Connecter un webhook Discord"
          href="/docs/prise-en-main/webhook-discord"
        >
          L'étape indispensable : c'est le webhook qui stocke tes fichiers.
        </DocCard>
        <DocCard
          icon={Smartphone}
          title="Installer l'app iPhone"
          href="/docs/prise-en-main/installer-l-app"
        >
          Retrouve tes drives synchronisés dans une vraie app native iOS.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
