/**
 * Compte Cord — pure helpers shared by the server (auth.ts, /api/account) and
 * the client (login errors, settings). No env, no I/O: unit-tested in
 * `cord-shared.test.ts`.
 */

/** Sections of the Cord account portal we deep-link to from Settings. */
export const CORD_PORTAL_SECTIONS = {
  security: "#securite",
  devices: "#appareils",
  apps: "#apps",
} as const;

export function cordPortalUrl(
  base: string | undefined,
  section?: keyof typeof CORD_PORTAL_SECTIONS,
): string | null {
  if (!base) return null;
  const root = base.replace(/#.*$/, "").replace(/\/+$/, "");
  return section ? `${root}/${CORD_PORTAL_SECTIONS[section]}` : `${root}/`;
}

/** Cord-hosted avatars look like `<issuer>/avatar/<id>?v=<hash>`. */
export function isCordAvatar(url: string | null | undefined, issuer: string | undefined): boolean {
  if (!url || !issuer) return false;
  return url.startsWith(`${issuer.replace(/\/+$/, "")}/avatar/`);
}

/**
 * New avatar to store after a Cord sign-in, or `undefined` to leave it alone.
 * Cord only fills an EMPTY avatar, then keeps its own avatar fresh (new hash,
 * photo removed). A photo set elsewhere (upload, Discord, Google) is never touched.
 */
export function nextImageAfterCord(
  current: string | null | undefined,
  picture: string | null | undefined,
  issuer: string | undefined,
): string | null | undefined {
  // Only trust avatars served by Cord itself.
  const pic = isCordAvatar(picture, issuer) ? picture! : null;
  if (!current) return pic ?? undefined;
  if (!isCordAvatar(current, issuer)) return undefined;
  if (pic === current) return undefined;
  return pic;
}

/** Claims we keep from the stored Cord id_token (payload only; it was verified at sign-in). */
export type CordIdentity = { name: string | null; email: string | null };

export function cordIdentityFromIdToken(idToken: string | null | undefined): CordIdentity | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const binary = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const json = JSON.parse(
      new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0))),
    ) as { name?: unknown; email?: unknown };
    return {
      name: typeof json.name === "string" && json.name ? json.name : null,
      email: typeof json.email === "string" && json.email ? json.email : null,
    };
  } catch {
    return null;
  }
}

/** Providers that can open a Drivecord session on their own (Patreon only links). */
const SIGN_IN_PROVIDERS = new Set(["google", "discord"]);

/**
 * Cord can be unlinked only if the user can still sign in afterwards: a
 * password, a passkey, or another sign-in provider (Google / Discord).
 */
export function canUnlinkCord(input: {
  hasPassword: boolean;
  passkeyCount: number;
  providers: string[];
}): boolean {
  return (
    input.hasPassword ||
    input.passkeyCount > 0 ||
    input.providers.some((p) => SIGN_IN_PROVIDERS.has(p))
  );
}

export type LoginErrorMessage = {
  title: string;
  description: string;
  /** Optional call to action: an external link (Cord portal) or an in-app route. */
  action?: { label: string; href: string; external?: boolean };
};

/**
 * Human, French message for an Auth.js `?error=` code. `provider` is the
 * provider the user just tried (remembered client-side before the redirect),
 * because Auth.js doesn't say which provider failed.
 */
export function loginErrorMessage(
  error: string | null | undefined,
  provider: string | null | undefined,
  cordPortal?: string | null,
): LoginErrorMessage | null {
  if (!error) return null;
  const cord = provider === "cord";
  switch (error) {
    case "CordEmailNotVerified":
      return {
        title: "Adresse email non confirmée",
        description:
          "Confirme d’abord ton adresse email dans ton Compte Cord, puis réessaie « Continuer avec Cord ».",
        ...(cordPortal ? { action: { label: "Ouvrir mon Compte Cord", href: cordPortal, external: true } } : {}),
      };
    case "OAuthAccountNotLinked":
      return cord
        ? {
            title: "Cet email a déjà un compte Drivecord",
            description:
              "Ton compte Cord n’est pas encore associé à ce compte. Connecte-toi avec ta méthode habituelle (mot de passe, passkey, Google ou Discord), puis associe Cord dans Réglages → Compte Cord.",
          }
        : {
            title: "Compte déjà associé ailleurs",
            description:
              "Ce compte est déjà associé à un autre compte Drivecord. Connecte-toi avec ta méthode habituelle.",
          };
    case "CordAlreadyLinked":
      return {
        title: "Compte Cord déjà utilisé",
        description:
          "Ce compte Cord est déjà associé à un autre compte Drivecord. Dissocie-le de l’autre compte d’abord, ou connecte-toi avec lui.",
      };
    case "CordLinkNeedsFullSession":
      return {
        title: "Termine d’abord ta connexion",
        description: "Valide ta connexion (code ou 2FA), puis associe Cord depuis Réglages.",
      };
    case "OAuthCallbackError":
    case "AccessDenied":
      return cord
        ? {
            title: "Connexion avec Cord annulée",
            description:
              "Tu as refusé l’accès ou fermé la page Cord. Rien n’a été modifié — tu peux réessayer quand tu veux.",
          }
        : {
            title: "Connexion annulée",
            description: "La connexion a été annulée ou refusée. Tu peux réessayer.",
          };
    case "CredentialsSignin":
      return { title: "Identifiants incorrects", description: "Email ou mot de passe incorrect." };
    case "Verification":
      return { title: "Lien expiré", description: "Ce lien de connexion a expiré ou a déjà servi." };
    default:
      return {
        title: cord ? "Connexion avec Cord impossible" : "Connexion impossible",
        description: "Une erreur est survenue pendant la connexion. Réessaie dans un instant.",
      };
  }
}
