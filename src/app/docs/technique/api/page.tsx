import type { Metadata } from "next";
import { Settings2, ShieldCheck } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "API publique",
  description:
    "Intègre un drive Drivecord dans ton propre site : upload, lecture et suppression de fichiers via une clé API.",
};

export default function Page() {
  return (
    <DocPage
      title="API publique"
      lead="Une clé API te permet d'uploader, lister, télécharger et supprimer des fichiers d'un drive directement depuis le serveur d'un autre site — sans passer par cette interface."
    >
      <DocH2>Créer une clé</DocH2>
      <p>
        Dans <strong>Réglages → API pour développeurs</strong>, choisis le
        drive concerné et génère une clé. Elle n&apos;est affichée{" "}
        <strong>qu&apos;une seule fois</strong> : copie-la immédiatement dans
        la configuration de ton site (variable d&apos;environnement,
        jamais dans du code commité).
      </p>

      <Callout variant="warning" title="Pas de chiffrement de bout en bout">
        Les fichiers envoyés via l&apos;API sont stockés{" "}
        <strong>en clair</strong> (contrairement à l&apos;app web, chiffrée
        côté client) : un appel serveur-à-serveur n&apos;a pas accès à ta
        clé de chiffrement personnelle. N&apos;utilise pas l&apos;API pour des
        fichiers sensibles.
      </Callout>

      <DocH2>Authentification</DocH2>
      <p>
        Toutes les routes sont sous <code>/api/v1</code> et attendent un
        en-tête <code>Authorization</code> :
      </p>
      <pre>
        <code>{`Authorization: Bearer dvc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`}</code>
      </pre>
      <p>
        Chaque clé est liée à <strong>un seul drive</strong> et porte une ou
        deux permissions : <code>read</code> (lecture) et <code>write</code>{" "}
        (upload + suppression). Les routes gèrent le CORS — tu peux les
        appeler directement depuis le navigateur d&apos;un site tiers si tu
        préfères, mais garder la clé côté serveur reste plus sûr.
      </p>

      <DocH2>Vérifier la clé</DocH2>
      <pre>
        <code>{`curl https://ton-domaine.tld/api/v1/me \\
  -H "Authorization: Bearer dvc_xxx"

# → { "drive": "Mon site", "driveId": "...", "scopes": ["read", "write"] }`}</code>
      </pre>

      <DocH2>Uploader un fichier</DocH2>
      <p>
        <code>POST /api/v1/files</code> — <code>multipart/form-data</code>{" "}
        avec un champ <code>file</code>, et optionnellement{" "}
        <code>parentId</code> (dossier cible) et <code>filename</code>.
      </p>
      <pre>
        <code>{`curl -X POST https://ton-domaine.tld/api/v1/files \\
  -H "Authorization: Bearer dvc_xxx" \\
  -F "file=@/chemin/vers/fichier.pdf"`}</code>
      </pre>
      <p>
        Réponse <code>201</code> avec les métadonnées du fichier créé
        (<code>id</code>, <code>filename</code>, <code>size</code>,
        <code>mimeType</code>…).
      </p>

      <DocH3>Limite de taille (upload simple)</DocH3>
      <p>
        Ce chemin transite par notre serveur en une seule requête : la taille
        est donc bornée par la limite de requête de l&apos;hébergeur (45 Mio
        ici). Pour des fichiers plus gros, utilise l&apos;upload par morceaux
        ci-dessous.
      </p>

      <DocH2>Upload par morceaux (taille illimitée)</DocH2>
      <p>
        Pour dépasser la limite de requête, découpe ton fichier en morceaux
        d&apos;environ 9 Mio et envoie-les un par un à{" "}
        <code>POST /api/v1/files/chunks</code> (champ{" "}
        <code>chunk</code>, plus <code>index</code> pour l&apos;ordre), puis
        finalise avec un appel JSON à <code>POST /api/v1/files</code>{" "}
        contenant la liste des morceaux renvoyés. Aucune limite de taille sur
        ce dernier appel : il ne transporte que des références, jamais les
        octets du fichier.
      </p>
      <pre>
        <code>{`# 1. un POST par morceau (~9 Mio chacun)
curl -X POST https://ton-domaine.tld/api/v1/files/chunks \\
  -H "Authorization: Bearer dvc_xxx" \\
  -F "index=0" -F "chunk=@part-000"
# → { "index": 0, "size": ..., "messageId": "...", "attachmentId": "...", "url": "...", "expiresAt": ... }

# … répète pour chaque morceau (index=1, 2, 3…) …

# 2. finalise avec la liste des morceaux (JSON, pas de fichier)
curl -X POST https://ton-domaine.tld/api/v1/files \\
  -H "Authorization: Bearer dvc_xxx" \\
  -H "Content-Type: application/json" \\
  -d '{
        "filename": "video.mp4",
        "mimeType": "video/mp4",
        "chunks": [ { "index": 0, "size": 9500000, "messageId": "...", "attachmentId": "...", "url": "..." }, ... ]
      }'`}</code>
      </pre>
      <Callout variant="tip" title="Chaque morceau reste sous la limite de requête">
        Chaque appel à <code>/api/v1/files/chunks</code> ne transporte qu&apos;un
        seul morceau (max ~10 Mio), donc il ne rencontre jamais la limite de
        requête de l&apos;hébergeur — seul le nombre d&apos;appels change avec
        la taille du fichier.
      </Callout>

      <DocH2>Lister les fichiers</DocH2>
      <pre>
        <code>{`curl "https://ton-domaine.tld/api/v1/files?parentId=&limit=50" \\
  -H "Authorization: Bearer dvc_xxx"`}</code>
      </pre>

      <DocH2>Récupérer un fichier</DocH2>
      <p>
        <code>GET /api/v1/files/:id</code> renvoie les métadonnées.{" "}
        <code>GET /api/v1/files/:id/download</code> renvoie directement les
        octets du fichier (déchiffrés si besoin), prêts à être servis ou
        relayés par ton site.
      </p>
      <pre>
        <code>{`curl https://ton-domaine.tld/api/v1/files/abc123/download \\
  -H "Authorization: Bearer dvc_xxx" \\
  -o fichier.pdf`}</code>
      </pre>

      <DocH2>Lien public permanent (hotlink)</DocH2>
      <p>
        <code>POST /api/v1/files/:id/public</code> crée un lien{" "}
        <strong>public, sans mot de passe, qui n&apos;expire pas</strong> —
        utilisable directement dans un <code>{`<img src>`}</code>, une balise{" "}
        <code>{`<a>`}</code> ou un <code>fetch()</code>, sans en-tête{" "}
        <code>Authorization</code>. Un seul lien public actif par fichier :
        recréer un lien remplace le précédent (et remplace aussi un lien créé
        depuis l&apos;interface Drivecord pour ce même fichier, le cas
        échéant). <code>DELETE /api/v1/files/:id/public</code> le révoque.
      </p>
      <pre>
        <code>{`curl -X POST https://ton-domaine.tld/api/v1/files/abc123/public \\
  -H "Authorization: Bearer dvc_xxx"

# → { "token": "...", "url": "https://ton-domaine.tld/api/v1/public/..." }`}</code>
      </pre>
      <p>
        Colle directement l&apos;<code>url</code> renvoyée dans ton site :
      </p>
      <pre>
        <code>{`<img src="https://ton-domaine.tld/api/v1/public/xxxxxxxxxx" alt="…" />`}</code>
      </pre>
      <Callout variant="warning" title="Public veut dire public">
        N&apos;importe qui possédant l&apos;URL peut voir ce fichier, sans
        limite de temps tant que le lien n&apos;est pas révoqué. Ne l&apos;utilise
        pas pour du contenu sensible.
      </Callout>

      <DocH2>Supprimer un fichier</DocH2>
      <pre>
        <code>{`curl -X DELETE https://ton-domaine.tld/api/v1/files/abc123 \\
  -H "Authorization: Bearer dvc_xxx"`}</code>
      </pre>

      <DocH2>Limites de débit</DocH2>
      <p>
        Chaque clé est limitée à <strong>60 requêtes/minute</strong> sur les
        routes générales, et <strong>300/minute</strong> sur{" "}
        <code>/api/v1/files/chunks</code> (une grosse vidéo peut demander
        beaucoup de petits appels). Les liens publics (
        <code>/api/v1/public/:token</code>, pas d&apos;authentification) sont
        limités à <strong>300 requêtes/minute par IP</strong>. Au-delà,
        l&apos;API répond <code>429</code> avec un en-tête{" "}
        <code>Retry-After</code>.
      </p>

      <DocH2>Et ensuite</DocH2>
      <CardGrid>
        <DocCard
          icon={ShieldCheck}
          title="Chiffrement de bout en bout"
          href="/docs/securite/chiffrement"
        >
          Comprendre ce qui est chiffré côté client, et ce qui ne l&apos;est pas.
        </DocCard>
        <DocCard
          icon={Settings2}
          title="Connecter un webhook Discord"
          href="/docs/prise-en-main/webhook-discord"
        >
          Créer le drive que ta clé API va utiliser.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
