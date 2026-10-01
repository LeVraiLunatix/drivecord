"use client";

import * as React from "react";
import { authFetch } from "@/lib/api-base";
import { useSession } from "next-auth/react";
import { isNativeApp } from "@/lib/use-platform";

/**
 * Dans l'app native (iOS), enregistre l'appareil aux notifications push dès
 * qu'une session complète est ouverte : permission → jeton APNs → envoi au
 * serveur (/api/push/register). L'appareil recevra alors une notification
 * quand une connexion demande approbation (style Epic Games).
 *
 * Sur le web, ce composant ne fait rien. Le tap sur la notification ramène
 * l'app au premier plan ; le LoginApprovalWatcher (déjà monté globalement)
 * détecte la demande par polling et affiche la fenêtre d'approbation.
 */
const TOKEN_KEY = "drivecord:push-token";

/**
 * À la déconnexion : retire le jeton de cet appareil du compte qu'on quitte,
 * pour qu'il ne reçoive plus ses demandes de connexion. À appeler AVANT de
 * fermer la session (la route exige d'être connecté).
 */
export async function unregisterNativePush(): Promise<void> {
  let token: string | null = null;
  try { token = localStorage.getItem(TOKEN_KEY); } catch { /* storage off */ }
  if (!token) return;
  await authFetch("/api/push/register", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token }),
  }).catch(() => {});
}

export function NativePushRegister() {
  const { data: session, status } = useSession();
  const isFull = status === "authenticated" && session?.level === "full";
  const userId = isFull ? session?.user?.id ?? null : null;
  // Account the device was last registered for: logging into another
  // account without a reload (logout → /login are client-side) must register
  // the token for the new one too.
  const doneFor = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (!userId || doneFor.current === userId || !isNativeApp()) return;
    doneFor.current = userId;

    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        );

        const reg = await PushNotifications.addListener(
          "registration",
          (token) => {
            try { localStorage.setItem(TOKEN_KEY, token.value); } catch { /* storage off */ }
            void authFetch("/api/push/register", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token: token.value, platform: "ios" }),
            }).catch(() => {});
          },
        );
        const err = await PushNotifications.addListener(
          "registrationError",
          (e) => console.warn("[push] registration error", e),
        );
        cleanup = () => {
          void reg.remove();
          void err.remove();
        };

        let perm = await PushNotifications.checkPermissions();
        if (perm.receive === "prompt") {
          perm = await PushNotifications.requestPermissions();
        }
        if (perm.receive === "granted") {
          await PushNotifications.register();
        }
      } catch (e) {
        // Plugin absent du build natif (pas encore cap sync) → silencieux.
        console.warn("[push] indisponible", e);
      }
    })();

    return () => cleanup?.();
  }, [userId]);

  return null;
}
