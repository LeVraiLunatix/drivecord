import { authFetch } from "@/lib/api-base";

/**
 * Tell the server a batch is over so it can refresh the Compte Cord hub
 * (see /api/account/cord/sync). Fire and forget: never blocks nor surfaces an error.
 */
export function signalCordSync(body: { reason: "uploads" } | { reason: "backup"; count: number }): void {
  authFetch("/api/account/cord/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}
