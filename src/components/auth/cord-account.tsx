"use client";

import useSWR from "swr";
import { signIn } from "next-auth/react";
import { apiFetcher, apiUrl, IS_DESKTOP } from "@/lib/api-base";
import { oauthSignIn } from "@/lib/auth/oauth";
import { isNativeApp } from "@/lib/use-platform";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

function useCordEnabled() {
  const { data } = useSWR<Record<string, unknown>>("/api/auth/providers", apiFetcher, { revalidateOnFocus: false });
  return Boolean(data?.cord);
}

export function CordSignInButton({ callbackUrl }: { callbackUrl: string }) {
  const enabled = useCordEnabled();
  if (!enabled) return null;
  return <Button className="w-full" variant="outline" onClick={() => oauthSignIn("cord", callbackUrl)}>Continuer avec mon compte Cord</Button>;
}

export function CordAccountCard({ linked }: { linked: boolean }) {
  const enabled = useCordEnabled();
  if (!enabled) return null;
  const portal = process.env.NEXT_PUBLIC_CORD_ACCOUNT_URL;
  return <Card><CardHeader><CardTitle className="text-base">Compte Cord</CardTitle></CardHeader><CardContent className="space-y-3">
    <p className="text-sm text-muted-foreground">{linked ? "Ton compte Cord est associé à Drivecord." : "Associe ton compte Cord pour te connecter avec la même identité dans toute la suite."}</p>
    {!linked && <Button variant="outline" onClick={() => {
      if (isNativeApp() || IS_DESKTOP) { window.open(apiUrl("/settings"), "_blank", "noopener,noreferrer"); return; }
      void signIn("cord", { callbackUrl: "/settings" });
    }}>Associer mon compte Cord</Button>}
    {portal && <Button variant="outline" onClick={() => window.open(portal, "_blank", "noopener,noreferrer")}>Gérer mon compte et associer Passcord</Button>}
    <p className="text-xs text-muted-foreground">Dans les réglages Cord, associe Passcord pour valider tes connexions avec ton iPhone. Les données de tes drives restent dans Drivecord.</p>
  </CardContent></Card>;
}
