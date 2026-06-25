import type { Metadata } from "next";
import { UserCheck, ShieldCheck } from "lucide-react";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Callout } from "@/components/docs/callout";
import { CardGrid, DocCard } from "@/components/docs/doc-cards";

export const metadata: Metadata = {
  title: "Ce que Discord voit",
  description:
    "Ce que Discord (et le serveur Drivecord) peuvent réellement voir de tes fichiers : des blocs chiffrés, et quelques métadonnées.",
};

export default function Page() {
  return (
    <DocPage
      title="Ce que Discord voit"
      lead="Spoiler : des blocs chiffrés. Mais soyons précis sur ce qui reste visible malgré tout."
    >
      <DocH2>Discord ne voit que du chiffré</DocH2>
      <p>
        Le contenu de tes fichiers est chiffré <strong>avant</strong>{" "}d&apos;être
        envoyé. Pour Discord, chaque chunk n&apos;est qu&apos;une pièce jointe
        d&apos;octets aléatoires — <strong>impossible à lire</strong>{" "}sans ta clé.
      </p>

      <DocH2>Ce que Discord sait quand même</DocH2>
      <p>Le chiffrement protège le <em>contenu</em>, pas les métadonnées :</p>
      <ul>
        <li>Qu&apos;<strong>un fichier a été envoyé</strong>, et quand.</li>
        <li>
          La <strong>taille</strong>{" "}approximative (nombre et poids des chunks).
        </li>
        <li>Le <strong>salon</strong>{" "}et le webhook utilisés.</li>
      </ul>
      <p>
        En revanche, ni le <strong>nom</strong>, ni le <strong>type</strong>, ni
        le <strong>contenu</strong>{" "}de tes fichiers ne sont lisibles par Discord.
      </p>

      <DocH2>Et le serveur Drivecord ?</DocH2>
      <p>
        Il stocke l&apos;arborescence, les références de chunks et ta clé de drive
        (le tout chiffré au repos). Il pourrait donc <em>techniquement</em>{" "}
        déchiffrer tes fichiers normaux, mais <strong>jamais</strong>{" "}ton
        coffre-fort. Pour le détail, vois le{" "}
        <a href="/docs/securite/chiffrement">chiffrement de bout en bout</a>.
      </p>

      <Callout variant="warning" title="Conditions d'utilisation de Discord">
        Stocker des fichiers arbitraires via les webhooks peut entrer en tension
        avec les CGU de Discord. Utilise Drivecord de façon responsable et à tes
        risques.
      </Callout>

      <DocH2>Pour aller plus loin</DocH2>
      <CardGrid>
        <DocCard
          icon={UserCheck}
          title="Comptes & connexion"
          href="/docs/securite/comptes"
        >
          Comment ton compte protège tes accès et tes clés.
        </DocCard>
        <DocCard
          icon={ShieldCheck}
          title="Bonnes pratiques"
          href="/docs/securite/bonnes-pratiques"
        >
          Les réflexes pour garder tes fichiers vraiment privés.
        </DocCard>
      </CardGrid>
    </DocPage>
  );
}
