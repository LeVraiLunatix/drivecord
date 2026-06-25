import {
  Rocket,
  BookOpen,
  ShieldCheck,
  Settings,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocItem = {
  title: string;
  href: string;
  /** Une page non `ready` est affichée dans la sidebar mais grisée (« Bientôt »). */
  ready?: boolean;
};

export type DocSection = {
  title: string;
  icon: LucideIcon;
  items: DocItem[];
};

// ── Arborescence complète (source unique : sidebar, fil d'Ariane, pager) ───────
// On déclare TOUTE la structure dès maintenant pour montrer l'ampleur de la doc
// façon AltStore. Les `ready: true` se débloquent phase par phase.

export const docsNav: DocSection[] = [
  {
    title: "Prise en main",
    icon: Rocket,
    items: [
      { title: "Présentation", href: "/docs/prise-en-main/presentation", ready: true },
      { title: "Créer un compte", href: "/docs/prise-en-main/compte", ready: true },
      { title: "Connecter un webhook Discord", href: "/docs/prise-en-main/webhook-discord", ready: true },
      { title: "Installer l'app iPhone", href: "/docs/prise-en-main/installer-l-app", ready: true },
    ],
  },
  {
    title: "Utilisation",
    icon: BookOpen,
    items: [
      { title: "Envoyer des fichiers", href: "/docs/utilisation/envoyer-des-fichiers", ready: true },
      { title: "Organiser ses fichiers", href: "/docs/utilisation/organiser", ready: true },
      { title: "Aperçu des fichiers", href: "/docs/utilisation/apercu", ready: true },
      { title: "Partage par lien", href: "/docs/utilisation/partage", ready: true },
      { title: "Coffre-fort", href: "/docs/utilisation/coffre-fort", ready: true },
      { title: "Pellicule", href: "/docs/utilisation/pellicule", ready: true },
      { title: "Téléchargements", href: "/docs/utilisation/telechargements", ready: true },
      { title: "Statistiques", href: "/docs/utilisation/statistiques", ready: true },
      { title: "Raccourcis & palette", href: "/docs/utilisation/raccourcis", ready: true },
    ],
  },
  {
    title: "Sécurité & confidentialité",
    icon: ShieldCheck,
    items: [
      { title: "Chiffrement de bout en bout", href: "/docs/securite/chiffrement", ready: true },
      { title: "Ce que Discord voit", href: "/docs/securite/confidentialite", ready: true },
      { title: "Comptes & connexion", href: "/docs/securite/comptes", ready: true },
      { title: "Bonnes pratiques", href: "/docs/securite/bonnes-pratiques", ready: true },
    ],
  },
  {
    title: "Technique & self-host",
    icon: Settings,
    items: [
      { title: "Comment marche le stockage", href: "/docs/technique/fonctionnement" },
      { title: "Architecture & stack", href: "/docs/technique/architecture" },
      { title: "Auto-hébergement", href: "/docs/technique/auto-hebergement" },
      { title: "Variables d'environnement", href: "/docs/technique/configuration" },
    ],
  },
  {
    title: "Aide",
    icon: LifeBuoy,
    items: [
      { title: "FAQ", href: "/docs/faq", ready: true },
      { title: "Dépannage", href: "/docs/depannage" },
    ],
  },
];

// ── Helpers ────────────────────────────────────────────────────────────────────

/** Tous les items, dans l'ordre de déclaration. */
export function flattenDocs(): DocItem[] {
  return docsNav.flatMap((s) => s.items);
}

/** Uniquement les pages réellement disponibles (pour pager + cartes). */
export function readyDocs(): DocItem[] {
  return flattenDocs().filter((i) => i.ready);
}

/** Premier item disponible d'une section, s'il existe. */
export function firstReady(section: DocSection): DocItem | undefined {
  return section.items.find((i) => i.ready);
}

/** Page précédente / suivante dans le parcours de lecture (pages prêtes). */
export function getPager(pathname: string): {
  prev: DocItem | null;
  next: DocItem | null;
} {
  const ready = readyDocs();
  const idx = ready.findIndex((i) => i.href === pathname);
  if (idx === -1) return { prev: null, next: null };
  return { prev: ready[idx - 1] ?? null, next: ready[idx + 1] ?? null };
}

/** Section + item correspondant à une URL (pour le fil d'Ariane). */
export function getBreadcrumb(
  pathname: string
): { section: string; item: DocItem } | null {
  for (const section of docsNav) {
    const item = section.items.find((i) => i.href === pathname);
    if (item) return { section: section.title, item };
  }
  return null;
}

/** Slug d'ancre stable à partir d'un titre français (accents retirés). */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
