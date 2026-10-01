import type { Metadata } from "next";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";

export const metadata: Metadata = {
  title: "Comment marche le stockage",
  description: "Webhooks Discord, morceaux de 8 Mio, chiffrement local : le trajet complet d'un fichier dans Drivecord.",
};

export default function Page() {
  return (
    <DocPage title="Comment marche le stockage" lead="Drivecord n'héberge pas tes fichiers : il les chiffre chez toi et les confie à ton propre salon Discord.">
      <DocH2>Le trajet d&apos;un fichier</DocH2>
      <ol>
        <li>Ton navigateur (ou l&apos;app) <strong>chiffre</strong> le fichier par morceaux de 8 Mio, avec une clé propre au fichier.</li>
        <li>Chaque morceau est envoyé comme <strong>pièce jointe</strong> d&apos;un message, via le webhook de ton salon Discord.</li>
        <li>Drivecord enregistre seulement les <strong>références</strong> (identifiants de messages) et les métadonnées <strong>chiffrées</strong> : nom, type, taille réelle.</li>
        <li>Pour télécharger, l&apos;app récupère les morceaux, les assemble et les déchiffre sur ton appareil.</li>
      </ol>

      <DocH2>Pourquoi 8 Mio ?</DocH2>
      <p>
        C&apos;est la taille maximale d&apos;une pièce jointe sur un webhook Discord gratuit. Un gros fichier devient
        simplement une suite de morceaux ; il n&apos;y a pas de limite de taille de fichier autre que le temps d&apos;envoi.
      </p>

      <DocH2>Les liens Discord expirent</DocH2>
      <p>
        Les adresses de téléchargement de Discord sont signées et expirent après quelques heures. Drivecord les
        <strong> rafraîchit à la demande</strong> en relisant le message : tes fichiers ne « périssent » donc pas.
      </p>

      <DocH2>Ce que fait (et ne fait pas) le serveur</DocH2>
      <ul>
        <li>Il connaît la structure de tes dossiers (sans leurs noms) et les identifiants de messages Discord.</li>
        <li>Il garde l&apos;URL de ton webhook <strong>chiffrée</strong> et ne la sert qu&apos;à toi.</li>
        <li>Il ne voit jamais un octet de contenu en clair, ni une clé de déchiffrement.</li>
      </ul>

      <Callout variant="warning" title="Si tu supprimes le salon ou le webhook">
        Les fichiers disparaissent avec lui : ils vivent sur Discord. Garde ton salon, et exporte ce qui compte.
      </Callout>

      <p>Pour le détail des clés, voir <a href="/docs/securite/chiffrement">Chiffrement de bout en bout</a>.</p>
    </DocPage>
  );
}
