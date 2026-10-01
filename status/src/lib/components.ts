import type { GroupId } from "./types";

/**
 * Inventory of everything the status page watches. Every probe is a public, read-only GET that needs no
 * secret and creates nothing; a "healthy" answer is whatever a correct deployment returns to an
 * anonymous caller (often a clean 401 JSON on an authenticated route, or a 404 for an unknown token).
 */

export type Origins = {
  /** Public URL of Drivecord. */
  app: string;
  /** Separate domain serving public files (`USERCONTENT_ORIGIN` of Drivecord); null when not configured. */
  usercontent: string | null;
  /** Issuer of the Cord Account OIDC provider. */
  cordIssuer: string;
  /** Cord hub website. */
  hub: string;
  desktopUpdater: string;
  iosSource: string;
  /** Third-party services Drivecord depends on (overridable so tests can point them at a fake). */
  discord: string;
  discordCdn: string;
  google: string;
  /** Neutral third party proving this service has network access. */
  control: string;
};

export function originsFromEnv(env: Record<string, string | undefined> = process.env): Origins {
  const clean = (v: string | undefined) => v?.trim().replace(/\/+$/, "") || null;
  return {
    app: clean(env.DRIVECORD_ORIGIN) ?? "https://drivecord.app",
    usercontent: clean(env.USERCONTENT_ORIGIN),
    cordIssuer: clean(env.CORD_ISSUER) ?? "https://compte.cordsuite.app",
    hub: clean(env.CORD_HUB_URL) ?? "https://www.cordsuite.app",
    desktopUpdater:
      clean(env.DESKTOP_UPDATER_URL) ?? "https://github.com/LeVraiLunatix/drivecord-desktop/releases/latest/download/latest.json",
    iosSource:
      clean(env.IOS_SOURCE_URL) ?? "https://raw.githubusercontent.com/LeVraiLunatix/drivecord-releases/main/source.json",
    discord: clean(env.DISCORD_URL) ?? "https://discord.com",
    discordCdn: clean(env.DISCORD_CDN_URL) ?? "https://cdn.discordapp.com",
    google: clean(env.GOOGLE_ACCOUNTS_URL) ?? "https://accounts.google.com",
    control: clean(env.CONTROL_URL) ?? "https://www.cloudflare.com/cdn-cgi/trace",
  };
}

export type JsonCheck = (body: unknown) => boolean;

export type HttpProbe = {
  kind: "http";
  url: (o: Origins) => string | null;
  /** Status codes a healthy deployment answers with. */
  expect: number[];
  /** Body requirement: parsed JSON passing `check`, or an HTML document. Guards against a dead host's generic 404/200 page. */
  body?: "json" | "html";
  check?: JsonCheck;
  /** Follow redirects (CDNs, GitHub release assets). Default: report the 3xx itself. */
  follow?: boolean;
  /** Per-probe override of the "slow" threshold. */
  slowMs?: number;
};

/** Read from Drivecord's `GET /api/health/components` (one request shared by every such component). */
export type HealthProbe = { kind: "health"; key: string };

export type ComponentDef = {
  id: string;
  group: GroupId;
  name: string;
  description: string;
  probe: HttpProbe | HealthProbe;
  /** Never reported better than these components (uploads need Discord, …). */
  needs?: string[];
  /** Needs the database; reported as a major outage at once when it is down. */
  dependsOnDb?: boolean;
  isDb?: boolean;
};

export const GROUPS: { id: GroupId; name: string }[] = [
  { id: "web", name: "Application web" },
  { id: "account", name: "Compte & sécurité" },
  { id: "storage", name: "Stockage" },
  { id: "developers", name: "Développeurs" },
  { id: "services", name: "Services annexes" },
];

const isObject = (b: unknown): b is Record<string, unknown> => typeof b === "object" && b !== null && !Array.isArray(b);
const hasKey = (k: string): JsonCheck => (b) => isObject(b) && k in b;
const errorJson: JsonCheck = (b) => isObject(b) && "error" in b;

const app = (path: string) => (o: Origins) => `${o.app}${path}`;

export const COMPONENTS: ComponentDef[] = [
  // ── Application web ─────────────────────────────────────────────────────────
  {
    id: "site",
    group: "web",
    name: "Site et accueil",
    description: "La page d'accueil de drivecord.app.",
    probe: { kind: "http", url: app("/"), expect: [200], body: "html" },
  },
  {
    id: "docs",
    group: "web",
    name: "Documentation",
    description: "Le guide d'utilisation et la documentation technique.",
    probe: { kind: "http", url: app("/docs"), expect: [200], body: "html" },
  },
  {
    id: "drive",
    group: "web",
    name: "Application drive",
    description: "L'espace de fichiers (/drive). Sans session, il renvoie vers la connexion.",
    probe: { kind: "http", url: app("/drive"), expect: [200, 302, 303, 307, 308] },
    dependsOnDb: true,
  },
  {
    id: "share-page",
    group: "web",
    name: "Pages de partage",
    description: "Les liens drivecord.app/s/… ouverts par les destinataires.",
    probe: { kind: "http", url: app("/s/statut-sonde"), expect: [200], body: "html", slowMs: 3500 },
    dependsOnDb: true,
  },
  {
    id: "usercontent",
    group: "web",
    name: "Fichiers publics",
    description: "Le domaine dédié qui sert les fichiers partagés publiquement.",
    probe: {
      kind: "http",
      url: (o) => (o.usercontent ? `${o.usercontent}/api/v1/public/statut-sonde` : null),
      expect: [404],
    },
  },
  {
    id: "admin",
    group: "web",
    name: "Administration",
    description: "L'interface d'administration (seul le code de réponse est vérifié, jamais de données).",
    probe: { kind: "http", url: app("/admin"), expect: [200, 302, 303, 307, 308, 401, 403] },
  },

  // ── Compte & sécurité ───────────────────────────────────────────────────────
  {
    id: "login",
    group: "account",
    name: "Connexion",
    description: "Le service d'authentification de Drivecord et ses méthodes de connexion.",
    probe: { kind: "http", url: app("/api/auth/providers"), expect: [200], body: "json", check: (b) => isObject(b) && Object.keys(b).length > 0 },
  },
  {
    id: "login-cord",
    group: "account",
    name: "Compte Cord",
    description: "« Continuer avec Cord » : le fournisseur d'identité de la suite Cord.",
    probe: { kind: "http", url: (o) => `${o.cordIssuer}/.well-known/openid-configuration`, expect: [200], body: "json", check: hasKey("issuer"), follow: true },
  },
  {
    id: "login-discord",
    group: "account",
    name: "Connexion avec Discord",
    description: "L'API Discord utilisée pour se connecter.",
    probe: { kind: "http", url: (o) => `${o.discord}/api/v10/gateway`, expect: [200], body: "json", check: hasKey("url") },
  },
  {
    id: "login-google",
    group: "account",
    name: "Connexion avec Google",
    description: "Le service d'identité Google utilisé pour se connecter.",
    probe: { kind: "http", url: (o) => `${o.google}/.well-known/openid-configuration`, expect: [200], body: "json", check: hasKey("issuer") },
  },
  {
    id: "login-password",
    group: "account",
    name: "Email et mot de passe",
    description: "La connexion classique par adresse e-mail.",
    probe: { kind: "http", url: app("/api/auth/csrf"), expect: [200], body: "json", check: hasKey("csrfToken") },
  },
  {
    id: "passkeys",
    group: "account",
    name: "Passkeys",
    description: "La connexion et la gestion des clés d'accès.",
    probe: { kind: "http", url: app("/api/settings/passkeys"), expect: [401], body: "json", check: errorJson },
    dependsOnDb: true,
  },
  {
    id: "two-factor",
    group: "account",
    name: "Double authentification",
    description: "Application d'authentification, codes de secours et codes par e-mail.",
    probe: { kind: "http", url: app("/api/settings/2fa"), expect: [401], body: "json", check: errorJson },
    needs: ["email"],
    dependsOnDb: true,
  },
  {
    id: "e2ee-keys",
    group: "account",
    name: "Clés de chiffrement",
    description: "Le dépôt des clés chiffrées de ton drive (le serveur n'a jamais la clé en clair).",
    probe: { kind: "http", url: app("/api/e2ee/keys"), expect: [401], body: "json", check: errorJson },
    dependsOnDb: true,
  },
  {
    id: "device-approval",
    group: "account",
    name: "Approbation d'un appareil",
    description: "Valider un nouvel appareil depuis un appareil déjà connecté.",
    probe: { kind: "http", url: app("/api/auth/login-requests/status"), expect: [200], body: "json", check: hasKey("status") },
    dependsOnDb: true,
  },
  {
    id: "vault",
    group: "account",
    name: "Coffre-fort",
    description: "Le coffre protégé par PIN.",
    probe: { kind: "http", url: app("/api/account/vault-pin"), expect: [401], body: "json", check: errorJson },
    dependsOnDb: true,
  },

  // ── Stockage ────────────────────────────────────────────────────────────────
  {
    id: "db",
    group: "storage",
    name: "Base de données",
    description: "Comptes, structure des dossiers et métadonnées chiffrées.",
    probe: { kind: "health", key: "db" },
    isDb: true,
  },
  {
    id: "discord",
    group: "storage",
    name: "Discord (API et webhooks)",
    description: "Le service qui héberge les morceaux chiffrés de tes fichiers.",
    probe: { kind: "health", key: "discord" },
  },
  {
    id: "discord-cdn",
    group: "storage",
    name: "Discord (CDN)",
    description: "Le réseau de diffusion Discord depuis lequel les fichiers sont relus.",
    probe: { kind: "http", url: (o) => `${o.discordCdn}/embed/avatars/0.png`, expect: [200] },
  },
  {
    id: "upload",
    group: "storage",
    name: "Envoi de fichiers",
    description: "Le dépôt de fichiers dans ton drive.",
    probe: { kind: "http", url: app("/api/drive/statut-sonde/stats"), expect: [401], body: "json", check: errorJson },
    needs: ["discord", "db"],
    dependsOnDb: true,
  },
  {
    id: "download",
    group: "storage",
    name: "Téléchargement de fichiers",
    description: "Le relais qui relit tes fichiers depuis Discord.",
    probe: { kind: "http", url: app("/api/proxy"), expect: [400] },
    needs: ["discord-cdn"],
  },
  {
    id: "shares",
    group: "storage",
    name: "Liens de partage",
    description: "La création et la lecture des liens de partage.",
    probe: { kind: "http", url: app("/api/s/statut-sonde"), expect: [404], body: "json", check: errorJson },
    needs: ["db"],
    dependsOnDb: true,
  },

  // ── Développeurs ────────────────────────────────────────────────────────────
  {
    id: "api-v2",
    group: "developers",
    name: "API v2",
    description: "L'API chiffrée pour les applications et les jetons personnels.",
    probe: {
      kind: "http",
      url: app("/api/v2/me"),
      expect: [401],
      body: "json",
      check: (b) => isObject(b) && isObject(b.error) && b.error.code === "unauthorized",
    },
    dependsOnDb: true,
  },
  {
    id: "api-v1",
    group: "developers",
    name: "API v1 (dépréciée)",
    description: "L'ancienne API à clés, maintenue jusqu'à sa fin de vie.",
    probe: { kind: "http", url: app("/api/v1/me"), expect: [401], body: "json", check: errorJson },
    dependsOnDb: true,
  },
  {
    id: "oauth-metadata",
    group: "developers",
    name: "OAuth : découverte",
    description: "Le document de configuration OAuth des applications connectées.",
    probe: { kind: "http", url: app("/.well-known/oauth-authorization-server"), expect: [200], body: "json", check: hasKey("token_endpoint") },
  },
  {
    id: "oauth-token",
    group: "developers",
    name: "OAuth : jetons",
    description: "L'échange de codes contre des jetons d'accès.",
    probe: { kind: "http", url: app("/api/oauth/token"), expect: [405] },
    dependsOnDb: true,
  },
  {
    id: "embed",
    group: "developers",
    name: "SDK et iframes",
    description: "Les boutons d'envoi et la visionneuse intégrables dans un autre site.",
    probe: { kind: "http", url: app("/embed/upload"), expect: [200], body: "html" },
  },
  {
    id: "openapi",
    group: "developers",
    name: "Spécification OpenAPI",
    description: "Le fichier openapi-v2.json de l'API.",
    probe: { kind: "http", url: app("/openapi-v2.json"), expect: [200], body: "json", check: hasKey("openapi") },
  },

  // ── Services annexes ────────────────────────────────────────────────────────
  {
    id: "email",
    group: "services",
    name: "E-mails transactionnels",
    description: "Codes de connexion, vérifications et alertes de sécurité.",
    probe: { kind: "health", key: "email" },
  },
  {
    id: "push",
    group: "services",
    name: "Notifications push",
    description: "Les notifications de l'app iPhone. Aucune vérification sans effet de bord n'existe : non surveillé automatiquement.",
    probe: { kind: "health", key: "push" },
  },
  {
    id: "patreon",
    group: "services",
    name: "Synchronisation Patreon",
    description: "Le lien avec Patreon qui attribue les avantages des mécènes.",
    probe: { kind: "health", key: "patreon" },
  },
  {
    id: "hub",
    group: "services",
    name: "Hub Cord",
    description: "Le site de la suite Cord (espace Drivecord, notifications).",
    probe: { kind: "http", url: (o) => `${o.hub}/`, expect: [200], body: "html", follow: true },
  },
  {
    id: "desktop-updates",
    group: "services",
    name: "Mises à jour Windows",
    description: "Le flux de mise à jour de Drivecord Desktop.",
    probe: { kind: "http", url: (o) => o.desktopUpdater, expect: [200], body: "json", check: hasKey("version"), follow: true, slowMs: 3500 },
  },
  {
    id: "ios-updates",
    group: "services",
    name: "App iPhone",
    description: "Le flux de mise à jour AltStore de l'app iPhone.",
    probe: { kind: "http", url: (o) => o.iosSource, expect: [200], body: "json", check: hasKey("apps"), follow: true },
  },
];

/** Components that are actually probed with this configuration (e.g. no content origin → no "Fichiers publics"). */
export function activeComponents(o: Origins): ComponentDef[] {
  return COMPONENTS.filter((c) => c.probe.kind === "health" || c.probe.url(o) !== null);
}
