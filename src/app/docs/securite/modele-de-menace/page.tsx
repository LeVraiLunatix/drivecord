import type { Metadata } from "next";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";

export const metadata: Metadata = {
  title: "Modèle de menace",
  description: "Les attaquants considérés, ce que Drivecord garantit, et ce qui reste hors périmètre.",
};

const rows: [string, string, string][] = [
  ["Discord (ou fuite de Discord)", "Ne voit que du chiffré aux noms opaques.", "Peut supprimer des données (disponibilité)."],
  ["Fuite de la base de Drivecord", "Aucune clé utilisable, noms et dossiers chiffrés ; webhooks chiffrés au repos ; jetons stockés hachés.", "Métadonnées : tailles, dates, arborescence."],
  ["Opérateur malveillant du serveur", "Ne peut pas lire les fichiers déjà envoyés.", "Pourrait servir du code piégé au prochain chargement du site (limite inhérente au web)."],
  ["Application tierce (OAuth)", "Confinée à son dossier, scopes explicites, jeton révocable, PKCE obligatoire.", "Ce que tu lui laisses lire dans ce dossier, elle le voit."],
  ["Site hôte d'un embed (iframe)", "Ne voit ni clés ni noms ; reçoit seulement {fileId, size}. Origine vérifiée dans les deux sens.", "Peut afficher une fausse interface autour de l'iframe."],
  ["Clé/jeton API volé", "Révocation immédiate, expiration, IP/origines restreintes, quotas, journal d'audit.", "Un jeton personnel donne accès aux données chiffrées (pas aux clés)."],
  ["Voleur d'appareil", "Appareil non déverrouillé : rien. Passkey/PIN requis selon la configuration.", "Appareil déjà déverrouillé : accès complet."],
];

export default function Page() {
  return (
    <DocPage title="Modèle de menace" lead="Contre qui Drivecord te protège, et jusqu'où.">
      <DocH2>Tableau</DocH2>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr><th>Menace</th><th>Ce qui est garanti</th><th>Limites</th></tr>
          </thead>
          <tbody>
            {rows.map(([a, b, c]) => (
              <tr key={a}><td>{a}</td><td>{b}</td><td>{c}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <DocH2>Principes</DocH2>
      <ul>
        <li>Le chiffrement n&apos;utilise que les primitives du navigateur / de Node (Web Crypto) et Argon2id.</li>
        <li>Chaque requête API est validée, limitée en débit et journalisée (adresses IP tronquées, 30 jours).</li>
        <li>Les fichiers publics ne sont servis que depuis un domaine isolé, avec des en-têtes empêchant l&apos;exécution.</li>
        <li>Les téléchargements côté serveur vers Discord passent par une liste blanche stricte (pas de SSRF).</li>
      </ul>

      <Callout variant="warning" title="Hors périmètre">
        Un appareil piraté, un navigateur malveillant, et l&apos;ingénierie sociale (te faire
        donner ta clé de récupération) ne sont pas couverts par le chiffrement.
      </Callout>

      <DocH2>Signaler une faille</DocH2>
      <p>
        Écris-nous en privé avant toute divulgation publique : voir <code>SECURITY.md</code> dans le dépôt.
      </p>
    </DocPage>
  );
}
