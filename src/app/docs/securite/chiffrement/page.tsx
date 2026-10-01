import type { Metadata } from "next";
import { Eye, Lock, ShieldAlert } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2, DocH3 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Chiffrement de bout en bout",
  description:
    "Comment Drivecord chiffre tes fichiers : AES-256-GCM sur ton appareil, hiérarchie de clés, récupération, et ce que le serveur ne peut pas faire.",
};

export default function Page() {
  return (
    <DocPage
      title="Chiffrement de bout en bout"
      lead="Comment ça marche vraiment : quelles clés existent, où elles vivent, et ce que ni Discord ni Drivecord ne peuvent faire."
    >
      <DocH2>Le principe</DocH2>
      <p>
        Tes fichiers, leurs <strong>noms</strong>, leur <strong>type</strong> et le{" "}
        <strong>nom de tes dossiers</strong> sont chiffrés en{" "}
        <code>AES-256-GCM</code> <strong>sur ton appareil</strong>, avant tout envoi. Les clés sont
        générées là aussi et ne quittent jamais ton appareil en clair. Le serveur Drivecord et Discord
        ne stockent que des octets illisibles.
      </p>

      <DocH2>La hiérarchie de clés</DocH2>
      <DocH3>Clé maître (MK)</DocH3>
      <p>
        32 octets aléatoires, créés dans ton navigateur à l&apos;inscription. Le serveur n&apos;en
        stocke que des copies <strong>enveloppées</strong> (chiffrées) par un secret que toi seul
        détiens : la <strong>clé de récupération</strong> (affichée une fois, à garder hors ligne), une{" "}
        <strong>phrase de chiffrement</strong> optionnelle (dérivée avec Argon2id : 64 Mio, 3 passes), une{" "}
        <strong>passkey</strong> compatible PRF, ou la clé d&apos;un appareil de confiance.
      </p>
      <DocH3>Clé de drive (DK)</DocH3>
      <p>Une par drive, enveloppée par la MK. Elle chiffre le nom des dossiers et enveloppe les clés de fichiers.</p>
      <DocH3>Clé de fichier (FK)</DocH3>
      <p>
        Une par fichier, aléatoire. Le fichier est découpé en morceaux de 8 Mio, chaque morceau chiffré
        avec un IV unique et lié à son identifiant et à sa position (données authentifiées) : on ne peut
        ni réordonner, ni tronquer, ni échanger des morceaux sans que le déchiffrement échoue.
      </p>

      <DocH2>Qui peut déchiffrer quoi</DocH2>
      <ul>
        <li><strong>Discord</strong> : rien. Les pièces jointes portent un identifiant opaque, jamais ton vrai nom.</li>
        <li><strong>Le serveur Drivecord</strong> : rien non plus. Il ne détient aucune clé utilisable ; une fuite de sa base ne révèle aucun contenu.</li>
        <li><strong>Toi</strong> : tout, sur chaque appareil que tu déverrouilles.</li>
        <li><strong>Un lien de partage</strong> : un seul fichier. La clé du fichier est dans le fragment de l&apos;URL (<code>#k=…</code>), que ton navigateur n&apos;envoie jamais au serveur.</li>
      </ul>

      <Callout variant="danger" title="Si tu perds tout, personne ne peut t'aider">
        Sans appareil déverrouillé, sans passkey, sans phrase <strong>et</strong> sans clé de
        récupération, tes fichiers sont définitivement illisibles. C&apos;est le prix d&apos;un chiffrement
        que même nous ne pouvons pas contourner. Garde ta clé de récupération hors ligne.
      </Callout>

      <DocH2>Nouvel appareil</DocH2>
      <p>
        Tu peux déverrouiller avec ta clé de récupération, ta phrase ou ta passkey, ou{" "}
        <strong>approuver depuis un appareil déjà déverrouillé</strong> : l&apos;échange de clés est
        authentifié par un code à 6 chiffres que tu compares sur les deux écrans, pour qu&apos;un
        attaquant ne puisse pas s&apos;intercaler.
      </p>

      <DocH2>Coffre-fort</DocH2>
      <p>
        Le <a href="/docs/utilisation/coffre-fort">coffre-fort</a> ajoute une couche : sa clé dépend de
        ton code PIN, étiré avec Argon2id côté client. Le PIN n&apos;est jamais envoyé ; le serveur ne
        reçoit qu&apos;une preuve dérivée et limite les essais.
      </p>

      <DocH2>Ce que ça ne protège pas</DocH2>
      <ul>
        <li>Un appareil compromis (logiciel malveillant, extension hostile) : il voit ce que tu vois.</li>
        <li>
          Les <strong>métadonnées</strong> : le serveur voit la taille (chiffrée), le nombre de morceaux,
          les dates et la structure des dossiers (sans les noms).
        </li>
        <li>Les fichiers volontairement publiés en clair via l&apos;<a href="/docs/technique/api-v2">API v2</a> (<code>visibility: public</code>).</li>
        <li>Le code servi par le site : un site compromis pourrait servir un code piégé. Le code est ouvert et les empreintes de version sont publiées.</li>
      </ul>

      <DocH2>Pour aller plus loin</DocH2>
      <CardGrid>
        <DocCard icon={ShieldAlert} title="Modèle de menace" href="/docs/securite/modele-de-menace">
          Ce contre quoi on se défend, et ce qui reste hors périmètre.
        </DocCard>
        <DocCard icon={Eye} title="Ce que Discord voit" href="/docs/securite/confidentialite">
          Le détail de ce que Discord et le serveur savent.
        </DocCard>
        <DocCard icon={Lock} title="Coffre-fort" href="/docs/utilisation/coffre-fort">
          Une couche de plus, protégée par ton PIN.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
