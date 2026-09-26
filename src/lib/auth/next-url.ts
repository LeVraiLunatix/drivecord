/**
 * Destination après une étape de connexion (`?next=/native-handoff` par ex.).
 * Seuls les chemins internes sont acceptés : pas de `//hôte` ni de `/\hôte`,
 * qui feraient sortir de Drivecord (redirection ouverte).
 */
export function safeNext(value: string | null | undefined, fallback = "/drive"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/**
 * `?callbackUrl=` de /login : Auth.js y met parfois une URL absolue de
 * Drivecord (`https://drivecord.app/drive?x`). On garde le chemin si l'origine
 * est la nôtre, sinon `fallback` — jamais de redirection vers un autre site.
 */
export function callbackPath(value: string | null | undefined, origin: string, fallback = "/drive"): string {
  if (!value) return fallback;
  if (value.startsWith("/")) return safeNext(value, fallback);
  try {
    const u = new URL(value);
    return u.origin === origin ? safeNext(`${u.pathname}${u.search}${u.hash}`, fallback) : fallback;
  } catch {
    return fallback;
  }
}

/** Version navigateur : lit `?next=` dans l'URL courante. */
export function nextFromLocation(fallback = "/drive"): string {
  if (typeof window === "undefined") return fallback;
  return safeNext(new URLSearchParams(window.location.search).get("next"), fallback);
}
