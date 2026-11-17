"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import { PageShell, PageHeader } from "@/components/kit/page-shell";

const sections: { title: string; body: string[] }[] = [
  {
    title: "1. Nature du service",
    body: [
      "Drivecord s'appuie sur des services tiers (Discord) hors de notre contrôle : des interruptions, changements ou pertes de données peuvent survenir. Garde une copie de ce qui compte.",
      "Le service est fourni « tel quel », sans aucune garantie de disponibilité, de fiabilité ou d'intégrité des données.",
    ],
  },
  {
    title: "2. Avertissement Discord",
    body: [
      "Drivecord stocke les fichiers via des webhooks Discord. Cet usage détourné peut violer les Conditions d'utilisation de Discord.",
      "Discord peut supprimer les fichiers, désactiver le webhook ou suspendre le compte concerné sans préavis. Cela entraîne une perte définitive des données stockées.",
      "Tu utilises Drivecord à tes propres risques. N'y stocke rien dont tu n'as pas une autre copie.",
    ],
  },
  {
    title: "3. Données & confidentialité",
    body: [
      "Les URL de webhook restent stockées localement dans ton navigateur. Une copie chiffrée est conservée côté serveur pour la synchronisation entre appareils.",
      "Les métadonnées des fichiers (nom, taille, dossier, tags) sont stockées sur nos serveurs pour permettre la synchronisation. Le contenu des fichiers est hébergé sur Discord.",
      "Aucune donnée n'est revendue ni partagée avec des tiers à des fins commerciales.",
    ],
  },
  {
    title: "4. Responsabilité",
    body: [
      "Drivecord et son auteur ne peuvent être tenus responsables d'une quelconque perte de données, dommage direct ou indirect lié à l'utilisation du service.",
      "Tu es seul responsable du contenu que tu téléverses et de sa conformité aux lois applicables.",
    ],
  },
  {
    title: "5. Usage acceptable",
    body: [
      "Il est interdit d'utiliser Drivecord pour stocker ou partager du contenu illégal.",
      "Tout abus peut entraîner la suppression du compte sans préavis.",
    ],
  },
];

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
};

export function ConditionsContent() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;

  return (
    <PageShell back="/" section="Conditions" width="max-w-2xl">
    <motion.div variants={v ?? container} initial="hidden" animate="show" className="flex flex-col gap-8">
      <motion.div variants={v ?? item}>
        <PageHeader
          kicker="Mentions légales"
          title="Conditions & mentions légales"
          accent="légales"
          lede="Les trucs chiants que personne ne lit, mais qu'il faut quand même."
        />
      </motion.div>

      <div className="space-y-8">
        {sections.map((s) => (
          <motion.section key={s.title} variants={v ?? item} className="space-y-2">
            <h2 className="text-lg font-semibold">{s.title}</h2>
            {s.body.map((p, i) => (
              <p key={i} className="text-sm leading-relaxed text-muted-foreground">
                {p}
              </p>
            ))}
          </motion.section>
        ))}
      </div>

      <motion.p variants={v ?? item} className="pt-4 text-xs text-muted-foreground/50">
        Dernière mise à jour : mai 2026 · Drivecord est un projet open source.
      </motion.p>
    </motion.div>
    </PageShell>
  );
}
