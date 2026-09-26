/**
 * Destination après une étape de connexion (`?next=/native-handoff` par ex.).
 * Seuls les chemins internes sont acceptés : pas de `//hôte` ni de `/\hôte`,
 * qui feraient sortir de Drivecord (redirection ouverte).
 */
export function safeNext(value: string | null | undefined, fallback = "/drive"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}

/** Version navigateur : lit `?next=` dans l'URL courante. */
export function nextFromLocation(fallback = "/drive"): string {
  if (typeof window === "undefined") return fallback;
  return safeNext(new URLSearchParams(window.location.search).get("next"), fallback);
}
