"use client";

import * as React from "react";
import useSWR from "swr";
import { BellRing, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { apiFetcher } from "@/lib/api-base";
import { isNativeApp } from "@/lib/use-platform";
import { linkCordAccount, type CordAccountInfo, useCordEnabled } from "@/components/auth/cord-account";

const CORD_HUB = process.env.NEXT_PUBLIC_CORD_ACCOUNT_URL || "https://compte.cordsuite.app";

/**
 * How to be told about a login request while the app is CLOSED.
 *
 * The sideloaded iOS app can't receive APNs pushes (that needs a paid Apple
 * developer account), so requests also go to the Compte Cord, whose web app
 * gets Web Push once added to the home screen — iOS only delivers Web Push
 * to home-screen web apps. Shown on the « Approuver » tab.
 */
export function CordPushHint() {
  const enabled = useCordEnabled();
  const { data: account } = useSWR<CordAccountInfo>("/api/account", apiFetcher, { revalidateOnFocus: false });
  if (!enabled || !account) return null;
  const linked = Boolean(account.cord);

  // Safari specifically: « Sur l'écran d'accueil » isn't offered elsewhere.
  const openHub = () => window.open(CORD_HUB, isNativeApp() ? "_system" : "_blank", "noopener,noreferrer");

  return (
    <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
      <CardContent className="space-y-3 py-5">
        <div className="flex items-center gap-2">
          <BellRing className="size-4 text-primary" />
          <p className="text-sm font-semibold">Être prévenu même app fermée</p>
        </div>
        {linked ? (
          <>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
              <li>Ouvre le Compte Cord dans <strong>Safari</strong>.</li>
              <li>Touche <strong>Partager</strong>, puis <strong>Sur l&apos;écran d&apos;accueil</strong>.</li>
              <li>Ouvre « Compte Cord » depuis l&apos;écran d&apos;accueil et <strong>active les notifications</strong>.</li>
            </ol>
            <p className="text-xs text-muted-foreground">
              Chaque demande de connexion à Drivecord y arrive alors en notification, avec son code.
            </p>
            <Button variant="outline" className="w-full gap-2" onClick={openHub}>
              Ouvrir le Compte Cord <ExternalLink className="size-3.5" />
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Les notifications passent par ton Compte Cord : associe-le d&apos;abord à Drivecord.
            </p>
            <Button variant="outline" className="w-full" onClick={() => linkCordAccount()}>
              Associer mon Compte Cord
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}
