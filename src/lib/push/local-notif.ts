"use client";

import { isNativeApp } from "@/lib/use-platform";

/**
 * Notification LOCALE (gratuite, sans programme Apple payant) déclenchée par
 * l'app native quand elle est ouverte/au premier plan et détecte une demande de
 * connexion cross-device. Contrairement au push APNs, elle ne réveille PAS une
 * app fermée — le JS doit tourner pour la programmer.
 *
 * No-op sur le web (la fenêtre in-app suffit) et si la permission est refusée.
 */
export async function notifyLoginRequest(info: {
  deviceLabel: string;
  location?: string | null;
  shortCode: string;
}): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { LocalNotifications } = await import(
      "@capacitor/local-notifications"
    );

    let perm = await LocalNotifications.checkPermissions();
    if (perm.display === "prompt" || perm.display === "prompt-with-rationale") {
      perm = await LocalNotifications.requestPermissions();
    }
    if (perm.display !== "granted") return;

    const where = info.location ? ` (${info.location})` : "";
    await LocalNotifications.schedule({
      notifications: [
        {
          id: Math.floor(Math.random() * 2_000_000_000),
          title: "Demande de connexion",
          body: `${info.deviceLabel}${where} veut se connecter · code ${info.shortCode}. Ouvre l'app pour approuver ou refuser.`,
          // Léger délai : iOS ignore parfois un schedule immédiat au premier plan.
          schedule: { at: new Date(Date.now() + 150) },
        },
      ],
    });
  } catch {
    // Plugin absent du build natif (pas encore `cap sync`) → silencieux.
  }
}
