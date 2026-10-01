import type { Metadata } from "next";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata: Metadata = {
  title: "SDK & iframe",
  description: "Intègre l'upload et l'affichage de fichiers chiffrés dans ton site avec @drivecord/sdk.",
};

export default function Page() {
  return (
    <DocPage title="SDK & iframe" lead="Un bouton d'upload et une visionneuse chiffrés de bout en bout, en quelques lignes. Moins de 3 Ko.">
      <DocH2>Navigateur : @drivecord/sdk</DocH2>
      <CodeBlock language="js">{`const dc = Drivecord.init({
  clientId: "app_…",
  redirectUri: location.origin + "/drivecord-callback",
});
await dc.signIn();                       // popup OAuth + PKCE

dc.mountUploader(document.getElementById("up"), {
  onUploaded: ({ fileId, size }) => save(fileId),
});
dc.mountViewer(document.getElementById("view"), { fileId });

const { files } = await dc.api("/files"); // API v2 avec le jeton de l'app`}</CodeBlock>
      <p>
        La page de redirection appelle simplement <code>Drivecord.completeSignIn()</code>. Le SDK n&apos;a aucune dépendance ; il est
        publié avec une empreinte SRI.
      </p>

      <DocH2>Ce qui se passe dans l&apos;iframe</DocH2>
      <ul>
        <li>Le fichier est chiffré <strong>dans l&apos;iframe Drivecord</strong> : ton site ne voit ni clé, ni nom, ni contenu.</li>
        <li>Seules les origines enregistrées pour ton application peuvent encadrer l&apos;iframe (<code>frame-ancestors</code>).</li>
        <li>Les messages sont versionnés et chaque côté vérifie l&apos;origine et la fenêtre émettrice. <code>uploaded</code> ne contient que <code>{`{ fileId, size }`}</code>.</li>
        <li>La connexion passe par une fenêtre Drivecord (ticket à usage unique) ; le jeton de session reste en mémoire dans l&apos;iframe, jamais dans un cookie.</li>
      </ul>
      <Callout variant="info" title="Déverrouillage">
        Les navigateurs isolent le stockage des iframes tierces : selon le navigateur, l&apos;utilisateur devra
        redonner sa clé de récupération ou sa phrase dans l&apos;iframe.
      </Callout>

      <DocH2>Serveur : @drivecord/node</DocH2>
      <CodeBlock language="js">{`import { DrivecordNode } from "@drivecord/node";
const dc = new DrivecordNode({ token: process.env.DRIVECORD_TOKEN, driveKey });
const { fileId } = await dc.upload({ name: "rapport.pdf", type: "application/pdf", data });
const file = await dc.download(fileId);   // { name, type, data }`}</CodeBlock>
      <p>Le même code de chiffrement que l&apos;application web est utilisé, donc les fichiers sont interchangeables.</p>
    </DocPage>
  );
}
