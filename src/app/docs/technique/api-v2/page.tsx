import type { Metadata } from "next";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";

export const metadata: Metadata = {
  title: "API publique v2",
  description:
    "La v2 de l'API Drivecord : permissions fines, clés qui expirent, erreurs uniformes, pagination, corbeille, renommage et déplacement.",
};

export default function Page() {
  return (
    <DocPage
      title="API publique v2"
      lead="Même principe que la v1 (une clé API liée à un drive), mais pensée pour la sécurité : permissions séparées, expiration, restriction par IP, erreurs uniformes et aucune fuite d'informations internes."
    >
      <Callout variant="info" title="La v1 continue de fonctionner">
        <code>/api/v1</code> reste disponible et inchangée (upload, liens
        publics permanents…). La v2 est sous <code>/api/v2</code> ; l&apos;upload
        n&apos;y est pas encore disponible, continue d&apos;utiliser{" "}
        <code>POST /api/v1/files</code> pour envoyer des fichiers.
      </Callout>

      <DocH2>Ce qui change par rapport à la v1</DocH2>
      <ul>
        <li>
          <strong>Quatre permissions distinctes</strong> :{" "}
          <code>read</code>, <code>write</code> (renommer, déplacer, étiqueter,
          corbeille), <code>delete</code> (suppression définitive) et{" "}
          <code>share</code> (liens publics). Aucune n&apos;en implique une
          autre : <code>write</code> ne permet plus de supprimer.
        </li>
        <li>
          <strong>Expiration</strong> (1 à 365 jours) et{" "}
          <strong>liste d&apos;adresses IP autorisées</strong> par clé, à la
          création dans <em>Réglages → API pour développeurs</em>. Ces deux
          protections s&apos;appliquent aussi à la v1.
        </li>
        <li>
          <strong>Pas de CORS</strong> : l&apos;API est faite pour un appel de
          serveur à serveur. Une clé placée dans du code de navigateur est une
          clé compromise, donc les navigateurs ne peuvent pas l&apos;appeler
          depuis un autre site.
        </li>
        <li>
          <strong>Le coffre-fort est invisible</strong> : ses fichiers
          n&apos;apparaissent jamais, ne peuvent être ni lus, ni modifiés, ni
          partagés, ni supprimés via l&apos;API.
        </li>
        <li>
          Les réponses n&apos;exposent plus les références Discord internes
          (messages, pièces jointes, URLs du CDN) : uniquement des métadonnées.
        </li>
        <li>
          Les clés existantes n&apos;ont que <code>read</code> et{" "}
          <code>write</code> : crée une nouvelle clé pour obtenir{" "}
          <code>delete</code> ou <code>share</code>.
        </li>
      </ul>

      <DocH2>Authentification</DocH2>
      <pre>
        <code>{`curl https://ton-domaine.tld/api/v2/me \\
  -H "Authorization: Bearer dvc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"

# → { "drive": { "id": "…", "name": "Mon site" },
#     "key": { "scopes": ["read"], "expiresAt": "…", "ipRestricted": false, … } }`}</code>
      </pre>

      <DocH2>Erreurs</DocH2>
      <p>
        Toutes les erreurs ont la même forme. <code>code</code> est stable (à
        utiliser dans ton code), <code>message</code> est lisible, et{" "}
        <code>requestId</code> (aussi dans l&apos;en-tête{" "}
        <code>X-Request-Id</code>) est à nous communiquer en cas de problème.
      </p>
      <pre>
        <code>{`HTTP/1.1 403
{ "error": { "code": "insufficient_scope",
             "message": "Cette clé n'a pas la permission \`delete\`.",
             "requestId": "9aeb54b3-…", "requiredScope": "delete" } }`}</code>
      </pre>
      <p>
        Codes courants : <code>unauthorized</code> (401),{" "}
        <code>key_expired</code> (401), <code>ip_not_allowed</code> (403),{" "}
        <code>insufficient_scope</code> (403), <code>not_found</code> (404),{" "}
        <code>invalid_request</code> / <code>unknown_field</code> /{" "}
        <code>invalid_cursor</code> (400), <code>conflict</code> /{" "}
        <code>parent_trashed</code> / <code>locked_items</code> (409),{" "}
        <code>rate_limited</code> (429).
      </p>

      <DocH3>Limites de débit</DocH3>
      <p>
        Par clé et par minute : 120 lectures, 60 écritures, 30 suppressions,
        30 téléchargements, 30 opérations de partage. Les en-têtes{" "}
        <code>X-RateLimit-Limit</code> / <code>X-RateLimit-Remaining</code>{" "}
        sont fournis, et <code>Retry-After</code> accompagne chaque{" "}
        <code>429</code>. Les tentatives avec une mauvaise clé sont aussi
        limitées par adresse IP.
      </p>

      <DocH2>Fichiers</DocH2>
      <pre>
        <code>{`# lister (scope read) — tous les paramètres sont optionnels
curl "https://ton-domaine.tld/api/v2/files?parentId=&sort=updatedAt&order=desc&limit=50" \\
  -H "Authorization: Bearer dvc_xxx"
# → { "files": [ { "id", "parentId", "filename", "size", "mimeType", "tags",
#                  "favorite", "encrypted", "trashed", "createdAt", … } ],
#     "nextCursor": "…" | null }`}</code>
      </pre>
      <p>Paramètres de liste :</p>
      <ul>
        <li>
          <code>parentId</code> (dossier, vide = racine) ou{" "}
          <code>recursive=true</code> pour tout le drive
        </li>
        <li>
          <code>trashed=false|only|all</code> (corbeille ; sans{" "}
          <code>parentId</code>, <code>only</code> et <code>all</code> couvrent
          tout le drive)
        </li>
        <li>
          <code>q</code> (nom contient), <code>mimeType</code> (ex.{" "}
          <code>image/</code>), <code>tag</code>, <code>favorite</code>,{" "}
          <code>updatedSince</code> (ms)
        </li>
        <li>
          <code>sort=name|createdAt|updatedAt</code>, <code>order=asc|desc</code>
          , <code>limit</code> (1 à 200), <code>cursor</code>
        </li>
      </ul>
      <p>
        La pagination se fait par curseur : repasse <code>nextCursor</code>{" "}
        tel quel (avec les mêmes <code>sort</code>/<code>order</code>) jusqu&apos;à
        ce qu&apos;il vaille <code>null</code>.
      </p>
      <pre>
        <code>{`# métadonnées, téléchargement (max 100 Mio)
curl https://ton-domaine.tld/api/v2/files/abc123 -H "Authorization: Bearer dvc_xxx"
curl https://ton-domaine.tld/api/v2/files/abc123/download -H "Authorization: Bearer dvc_xxx" -o f.pdf

# renommer / déplacer / étiqueter / corbeille (scope write)
curl -X PATCH https://ton-domaine.tld/api/v2/files/abc123 \\
  -H "Authorization: Bearer dvc_xxx" -H "Content-Type: application/json" \\
  -d '{ "filename": "facture.pdf", "parentId": "dossierId", "tags": ["2026"], "favorite": true }'

# mettre à la corbeille, puis restaurer
curl -X PATCH …/files/abc123 -H … -d '{ "trashed": true }'
curl -X PATCH …/files/abc123 -H … -d '{ "trashed": false }'

# supprimer définitivement (scope delete) — 204
curl -X DELETE https://ton-domaine.tld/api/v2/files/abc123 -H "Authorization: Bearer dvc_xxx"`}</code>
      </pre>
      <p>
        Un champ inconnu dans un corps JSON est refusé (<code>unknown_field</code>
        ). Un fichier à la corbeille ne peut qu&apos;être restauré, et on ne
        peut pas déplacer ni restaurer quoi que ce soit dans un dossier qui est
        lui-même à la corbeille (<code>parent_trashed</code>).
      </p>

      <DocH2>Dossiers</DocH2>
      <pre>
        <code>{`GET    /api/v2/folders?parentId=&recursive=&trashed=&sort=&limit=&cursor=   (read)
POST   /api/v2/folders        { "name": "Factures", "parentId": "", "color": "blue" }   (write)
GET    /api/v2/folders/:id                                                        (read)
PATCH  /api/v2/folders/:id    { "name"?, "parentId"?, "color"?, "trashed"? }      (write)
DELETE /api/v2/folders/:id    supprime le dossier, ses sous-dossiers et leurs fichiers  (delete)`}</code>
      </pre>
      <p>
        Mettre un dossier à la corbeille (ou le restaurer) s&apos;applique à tout
        son contenu. Déplacer un dossier dans lui-même ou dans un de ses
        descendants renvoie <code>cycle</code>. La suppression définitive est
        refusée (<code>locked_items</code>) si le dossier contient des éléments
        du coffre-fort.
      </p>

      <DocH2>Liens de partage</DocH2>
      <p>
        Scope <code>share</code>. Un seul lien actif par fichier : en créer un
        nouveau remplace l&apos;ancien.
      </p>
      <pre>
        <code>{`curl -X POST https://ton-domaine.tld/api/v2/files/abc123/share \\
  -H "Authorization: Bearer dvc_xxx" -H "Content-Type: application/json" \\
  -d '{ "expiresInSeconds": 86400, "password": "un mot de passe" }'
# → 201 { "share": { "token", "url", "passwordProtected": true, "expiresAt": "…" } }

GET    /api/v2/files/:id/share     # lien actuel, ou { "share": null }
DELETE /api/v2/files/:id/share     # révoquer`}</code>
      </pre>
      <p>
        Sans mot de passe, <code>url</code> est un lien direct utilisable dans
        une balise <code>{`<img>`}</code>. Avec un mot de passe, c&apos;est la
        page de partage Drivecord qui le demande.
      </p>
      <Callout variant="warning" title="Sans chiffrement de bout en bout">
        Comme pour la v1, les fichiers envoyés via l&apos;API sont stockés en
        clair, et un lien public sans mot de passe donne accès au fichier à
        quiconque possède l&apos;URL.
      </Callout>
    </DocPage>
  );
}
