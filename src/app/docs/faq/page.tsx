import * as React from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { DocPage } from "@/components/docs/doc-page";
import { DocH2 } from "@/components/docs/prose";
import { Faq, FaqItem } from "@/components/docs/faq";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Questions fréquentes sur Drivecord : fonctionnement, gratuité, sécurité, taille des fichiers, partage et app mobile.",
};

type QA = { q: string; a: React.ReactNode };
type Group = { cat: string; items: QA[] };

const FAQ: Group[] = [
  {
    cat: "Présentation",
    items: [
      {
        q: "C'est quoi Drivecord ?",
        a: (
          <p>
            Un clone moderne et amélioré de{" "}
            <a
              href="https://github.com/DisboxApp/disbox"
              target="_blank"
              rel="noopener noreferrer"
            >
              Disbox
            </a>{" "}
            : un stockage <strong>illimité</strong>{" "}propulsé par les webhooks
            Discord. Sans serveur, sans abonnement, et chiffré de bout en bout.
          </p>
        ),
      },
      {
        q: "Pourquoi l'utiliser ?",
        a: (
          <p>
            Tu transformes un simple salon Discord en cloud personnel : upload,
            dossiers, partage par lien. Tes données restent sur{" "}
            <strong>ton</strong>{" "}Discord.
          </p>
        ),
      },
    ],
  },
  {
    cat: "Démarrage",
    items: [
      {
        q: "Comment je commence ?",
        a: (
          <>
            <p>En 3 étapes :</p>
            <ol>
              <li>
                Crée un webhook Discord (
                <strong>Paramètres du salon → Intégrations → Webhooks</strong>).
              </li>
              <li>
                Connecte-le à Drivecord — l'URL est{" "}
                <strong>hashée localement</strong>.
              </li>
              <li>Glisse tes fichiers et partage ✨</li>
            </ol>
          </>
        ),
      },
      {
        q: "C'est gratuit ?",
        a: (
          <p>
            Oui, <strong>100 % gratuit</strong>. Aucune carte bancaire, aucun
            abonnement — le stockage est illimité grâce à Discord.
          </p>
        ),
      },
    ],
  },
  {
    cat: "Sécurité & confidentialité",
    items: [
      {
        q: "Mes fichiers sont-ils privés ?",
        a: (
          <p>
            Oui. Chiffrement <strong>E2EE</strong>{" "}(<code>AES-256-GCM</code>)
            côté client : tes fichiers sont chiffrés <strong>avant</strong>{" "}de
            quitter ton appareil. Rien n'est envoyé à un serveur tiers.
          </p>
        ),
      },
      {
        q: "Discord peut-il voir mes fichiers ?",
        a: (
          <p>
            Non. Discord ne stocke que des <strong>blobs chiffrés</strong>,
            illisibles sans ta clé. Sans le mot de passe / la clé, personne ne
            peut déchiffrer.
          </p>
        ),
      },
    ],
  },
  {
    cat: "Fonctionnalités",
    items: [
      {
        q: "Y a-t-il une limite de taille ?",
        a: (
          <p>
            Non. Découpage en <em>chunks</em>{" "}+ upload en parallèle —
            ultra-rapide, sans aucune limite.
          </p>
        ),
      },
      {
        q: "Quels fichiers puis-je prévisualiser ?",
        a: (
          <p>
            Vidéos, PDF, audio et images directement dans l'app — même les{" "}
            <code>.mov</code>{" "}et <code>.HEIC</code>.
          </p>
        ),
      },
      {
        q: "Comment partager ?",
        a: (
          <p>
            Des liens publics avec <strong>mot de passe</strong>,{" "}
            <strong>date d'expiration</strong>{" "}et{" "}
            <strong>compteur de téléchargements</strong>.
          </p>
        ),
      },
      {
        q: "Il y a une app mobile ?",
        a: (
          <p>
            Oui, une vraie <strong>app native iOS</strong>{" "}installable, avec
            sync multi-appareils.{" "}
            <Link href="/install">Voir comment l'installer →</Link>
          </p>
        ),
      },
    ],
  },
  {
    cat: "Open source & liens",
    items: [
      {
        q: "C'est open source ?",
        a: (
          <p>
            Oui ! Le code est sur{" "}
            <a
              href="https://github.com/LeVraiLunatix/drivecord"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
            .
          </p>
        ),
      },
      {
        q: "Où trouver les liens utiles ?",
        a: (
          <ul>
            <li>
              🔗 Site :{" "}
              <a
                href="https://drivecord.vercel.app"
                target="_blank"
                rel="noopener noreferrer"
              >
                drivecord.vercel.app
              </a>
            </li>
            <li>
              💻 Code :{" "}
              <a
                href="https://github.com/LeVraiLunatix/drivecord"
                target="_blank"
                rel="noopener noreferrer"
              >
                GitHub
              </a>
            </li>
            <li>
              📲 App iPhone : <Link href="/install">Installer</Link>
            </li>
          </ul>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <DocPage
      title="FAQ"
      lead="Les questions les plus fréquentes sur Drivecord. Il t'en manque une ? Le code et les discussions sont sur GitHub."
    >
      {FAQ.map((group) => (
        <React.Fragment key={group.cat}>
          <DocH2>{group.cat}</DocH2>
          <Faq>
            {group.items.map((item) => (
              <FaqItem key={item.q} q={item.q}>
                {item.a}
              </FaqItem>
            ))}
          </Faq>
        </React.Fragment>
      ))}
    </DocPage>
  );
}
