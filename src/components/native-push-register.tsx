"use client";

import * as React from "react";
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
export function NativePushRegister() {
  const { data: session, status } = useSession();
  const isFull = status === "authenticated" && session?.level === "full";
  const doneRef = React.useRef(false);

  React.useEffect(() => {
    if (!isFull || doneRef.current || !isNativeApp()) return;
    doneRef.current = true;

    let cleanup: (() => void) | undefined;
    (async () => {
      try {
        const { PushNotifications } = await import(
          "@capacitor/push-notifications"
        );

        const reg = await PushNotifications.addListener(
          "registration",
          (token) => {
            void fetch("/api/push/register", {
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
  }, [isFull]);

  return null;
}
