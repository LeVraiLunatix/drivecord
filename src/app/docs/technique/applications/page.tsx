import type { Metadata } from "next";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata: Metadata = {
  title: "Applications & OAuth",
  description: "Crée une application Drivecord : OAuth 2.1 avec PKCE, dossier dédié, scopes minimaux.",
};

export default function Page() {
  return (
    <DocPage title="Applications & OAuth" lead="Laisse tes utilisateurs connecter leur Drivecord à ton site, sans jamais voir le reste de leur drive.">
      <DocH2>Enregistrer une application</DocH2>
      <p>
        Va sur <a href="/developers">/developers</a> : nom, URL, <strong>URI de redirection exactes</strong> et{" "}
        <strong>origines autorisées</strong> (pour le SDK et les iframes). Un client « confidentiel »
        reçoit un secret (affiché une fois) pour les appels serveur.
      </p>

      <DocH2>Le flux</DocH2>
      <ul>
        <li>OAuth 2.1 : <strong>PKCE S256 obligatoire</strong>, pas de flux implicite, redirect_uri comparée exactement.</li>
        <li>Codes à usage unique valables 60 s ; un code rejoué révoque tout ce qu&apos;il a produit.</li>
        <li>Jetons d&apos;accès d&apos;1 h, jetons de rafraîchissement à rotation avec détection de réutilisation.</li>
        <li>Métadonnées : <code>/.well-known/oauth-authorization-server</code>.</li>
      </ul>
      <CodeBlock language="text">{`GET /oauth/authorize?client_id=app_…&redirect_uri=…&response_type=code
    &code_challenge=…&code_challenge_method=S256
    &scope=app_folder:read app_folder:write&state=…`}</CodeBlock>

      <DocH2>Permissions</DocH2>
      <ul>
        <li><code>app_folder:read</code> / <code>write</code> / <code>delete</code> : uniquement le dossier <code>Apps/&lt;ton app&gt;</code>, créé à l&apos;autorisation.</li>
        <li><code>profile:basic</code> : l&apos;identifiant du compte.</li>
      </ul>
      <Callout variant="info" title="Confinement">
        Un jeton d&apos;application ne voit jamais le reste du drive : un identifiant hors du dossier se comporte
        comme s&apos;il n&apos;existait pas. L&apos;utilisateur peut révoquer l&apos;accès à tout moment
        (Réglages → Applications connectées) ; l&apos;effet est immédiat.
      </Callout>
    </DocPage>
  );
}
