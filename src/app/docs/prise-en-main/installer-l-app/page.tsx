import type { Metadata } from "next";
import { Download, RefreshCw } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { Steps, Step } from "@/components/docs/steps";
import { CodeBlock } from "@/components/docs/code-block";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Installer l'app iPhone",
  description:
    "Drivecord n'est pas sur l'App Store : installe l'app native iOS gratuitement via AltStore (recommandé) ou Sideloadly.",
};

export default function Page() {
  return (
    <DocPage
      title="Installer l'app iPhone"
      lead="Drivecord n'est pas sur l'App Store. Deux méthodes gratuites pour l'installer : AltStore (mises à jour automatiques) ou Sideloadly (manuel)."
    >
      <DocH2>Pourquoi pas l'App Store ?</DocH2>
      <p>
        Drivecord est distribué en <em>sideload</em>{" "}: tu installes l'app
        toi-même avec ton <strong>Apple ID gratuit</strong>. Avantage : pas de
        validation Apple. Contrepartie : l'app doit être <strong>re-signée tous
        les 7 jours</strong>{" "}(AltStore le fait tout seul).
      </p>

      <Callout variant="tip" title="Les boutons de téléchargement sont sur la page Installer">
        Cette page explique la démarche ; pour récupérer l'<code>.ipa</code>{" "}et
        copier l'URL de la source, ouvre la page interactive{" "}
        <a href="/install">Installer l'app</a>.
      </Callout>

      <DocH2>Méthode 1 — AltStore (recommandé)</DocH2>
      <p>
        AltStore garde l'app à jour et la re-signe automatiquement. C'est la
        méthode la plus confortable.
      </p>
      <Steps>
        <Step title="Installe AltStore">
          Installe <strong>AltServer</strong>{" "}sur ton PC/Mac et{" "}
          <strong>AltStore</strong>{" "}sur ton iPhone (voir{" "}
          <a href="https://altstore.io" target="_blank" rel="noopener noreferrer">
            altstore.io
          </a>
          ).
        </Step>
        <Step title="Ajoute la source Drivecord">
          Dans AltStore : onglet <strong>Sources</strong>{" "}→ bouton{" "}
          <strong>+</strong>{" "}→ colle cette URL :
        </Step>
      </Steps>

      <CodeBlock language="Source AltStore">{`https://raw.githubusercontent.com/LeVraiLunatix/drivecord-releases/main/source.json`}</CodeBlock>

      <Steps>
        <Step title="Installe l'app">
          Onglet <strong>Browse</strong>{" "}→ <strong>Drivecord</strong>{" "}→{" "}
          <strong>GET</strong>. Entre ton Apple ID (gratuit) si demandé.
        </Step>
        <Step title="Mises à jour automatiques">
          AltStore re-signe l'app tous les <strong>7 jours</strong>{" "}et installe
          les nouvelles versions automatiquement (PC + iPhone sur le même
          Wi-Fi).
        </Step>
      </Steps>

      <DocH2>Méthode 2 — Sideloadly</DocH2>
      <p>
        Installation manuelle à partir du fichier <code>.ipa</code>, à renouveler
        toi-même tous les 7 jours.
      </p>
      <Steps>
        <Step title="Télécharge l'IPA">
          Récupère <code>Drivecord.ipa</code>{" "}depuis la page{" "}
          <a href="/install">Installer l'app</a>.
        </Step>
        <Step title="Installe Sideloadly">
          Sur PC (Windows) ou Mac — voir{" "}
          <a href="https://sideloadly.io" target="_blank" rel="noopener noreferrer">
            sideloadly.io
          </a>
          . Sur Windows, iTunes et iCloud (versions Apple) sont requis.
        </Step>
        <Step title="Branche ton iPhone">
          Connecte-le en USB et fais <strong>« Se fier »</strong>{" "}à
          l'ordinateur.
        </Step>
        <Step title="Glisse l'IPA + Apple ID">
          Glisse <code>Drivecord.ipa</code>{" "}dans Sideloadly, entre ton Apple ID,
          puis <strong>Start</strong>.
        </Step>
        <Step title="Fais confiance à l'app">
          Sur l'iPhone :{" "}
          <strong>
            Réglages → Général → VPN et gestion de l'appareil
          </strong>{" "}
          → fais confiance à ton profil.
        </Step>
      </Steps>

      <Callout variant="warning" title="Expiration au bout de 7 jours">
        Avec un Apple ID gratuit, l'app expire après 7 jours. Avec AltStore elle
        se renouvelle seule ; avec Sideloadly, il faut refaire l'opération.
      </Callout>

      <DocH2>Une fois installée</DocH2>
      <CardGrid>
        <DocCard
          icon={Download}
          title="Page Installer (téléchargements)"
          href="/install"
        >
          Boutons de téléchargement de l'IPA, copie de la source et tutoriels
          détaillés.
        </DocCard>
        <DocCard
          icon={RefreshCw}
          title="Créer un compte"
          href="/docs/prise-en-main/compte"
        >
          Connecte-toi pour retrouver tes drives synchronisés dans l'app.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
