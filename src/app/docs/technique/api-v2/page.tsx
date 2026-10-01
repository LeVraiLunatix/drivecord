import type { Metadata } from "next";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CodeBlock } from "@/components/docs/code-block";

export const metadata: Metadata = {
  title: "API v2",
  description: "API v2 de Drivecord : chiffrée de bout en bout, jetons OAuth ou personnels, morceaux de 8 Mio, idempotence.",
};

export default function Page() {
  return (
    <DocPage
      title="API v2"
      lead="L'API de référence. Elle ne manipule que des données chiffrées : le chiffrement se fait chez toi, avec le SDK."
    >
      <Callout variant="info" title="La v1 est dépréciée">
        L&apos;<a href="/docs/technique/api">API v1</a> stocke en clair et sera retirée le 30 septembre 2027
        (en-têtes <code>Deprecation</code> / <code>Sunset</code>). Migre vers la v2.
      </Callout>

      <DocH2>Authentification</DocH2>
      <p>Deux types de jetons, tous deux en <code>Authorization: Bearer …</code> :</p>
      <ul>
        <li>
          <strong>Jeton d&apos;application</strong> (<code>dvc_at_…</code>) obtenu via{" "}
          <a href="/docs/technique/applications">OAuth 2.1 + PKCE</a> : confiné au dossier de l&apos;application.
        </li>
        <li>
          <strong>Jeton personnel</strong> (<code>dvc_pat_…</code>), créé dans Réglages → Jetons personnels, pour
          tes propres scripts : accès à tout le drive selon ses permissions (<code>drive:read|write|delete|share</code>).
        </li>
      </ul>
      <Callout variant="warning" title="Un jeton ne donne que du chiffré">
        Pour lire un fichier, ton code doit aussi détenir la clé du drive. Avec Node, utilise{" "}
        <a href="/docs/technique/sdk"><code>@drivecord/node</code></a> qui fait tout le chiffrement.
      </Callout>

      <DocH2>Envoyer un fichier</DocH2>
      <ol>
        <li><code>POST /api/v2/uploads</code> avec <code>{`{ fileId, size }`}</code> (identifiant de 21 caractères généré chez toi, taille chiffrée).</li>
        <li><code>PUT /api/v2/uploads/:id/chunks/:i</code> pour chaque morceau (<code>application/octet-stream</code>, 8 Mio + 16 octets, tous sauf le dernier).</li>
        <li><code>POST /api/v2/uploads/:id/complete</code> avec <code>{`{ encMeta, fkWrapped, noncePrefix }`}</code>.</li>
      </ol>
      <CodeBlock language="bash">{`curl -X POST https://drivecord.app/api/v2/uploads \\
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \\
  -H "Idempotency-Key: $(uuidgen)" \\
  -d '{"fileId":"aBcDeFgHiJkLmNoPqRsTu","size":1048592}'`}</CodeBlock>

      <DocH2>Conventions</DocH2>
      <DocH3>Erreurs</DocH3>
      <p>Toujours <code>{`{ "error": { "code", "message", "requestId" } }`}</code>. Le <code>code</code> est stable (<code>insufficient_scope</code>, <code>rate_limited</code>, <code>chunk_mismatch</code>…).</p>
      <DocH3>Idempotence</DocH3>
      <p>Envoie <code>Idempotency-Key</code> sur les POST : la même requête est rejouée pendant 24 h, une requête différente avec la même clé donne <code>422</code>.</p>
      <DocH3>Limites</DocH3>
      <p>En-têtes <code>RateLimit-Limit/Remaining/Reset</code> et <code>Retry-After</code>. Quota d&apos;envoi quotidien par compte.</p>
      <DocH3>CORS</DocH3>
      <p>Jamais <code>*</code> sur les routes authentifiées : seules les origines enregistrées pour le jeton sont autorisées.</p>
      <DocH3>Pagination &amp; synchronisation</DocH3>
      <p><code>GET /files</code> et <code>/folders</code> utilisent un <code>cursor</code>. <code>GET /changes?cursor=</code> (jetons personnels) renvoie le journal des modifications du drive.</p>

      <DocH2>Fichiers publics</DocH2>
      <p>
        <code>visibility: &quot;public&quot;</code> à la création stocke le fichier <strong>en clair</strong> pour pouvoir
        le servir en lien direct (<code>POST /files/:id/public</code>). Un fichier chiffré ne peut jamais avoir de lien public.
      </p>

      <DocH2>Référence complète</DocH2>
      <p>Spécification OpenAPI 3.1 : <a href="/openapi-v2.json">/openapi-v2.json</a>.</p>
    </DocPage>
  );
}
