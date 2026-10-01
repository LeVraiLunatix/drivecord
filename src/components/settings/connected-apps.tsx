"use client";

import * as React from "react";
import useSWR from "swr";
import { BadgeCheck, Loader2, Plug, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { authFetch, apiFetcher as fetcher } from "@/lib/api-base";
import { DiscordClient } from "@/lib/discord";
import { getDrive, getFolderSubtreeFiles, hardDeleteFolderSubtree } from "@/lib/storage";

type Grant = {
  id: string;
  app: { name: string; iconUrl: string | null; homepageUrl: string; verified: boolean };
  driveId: string;
  driveName: string;
  appFolderId: string;
  scopes: string[];
  createdAt: string;
  lastActivityAt: string | null;
};

const SCOPE_FR: Record<string, string> = {
  "app_folder:write": "envoi", "app_folder:read": "lecture", "app_folder:delete": "suppression", "profile:basic": "profil",
};

/** Réglages › Applications connectées: who can reach which drive folder, and a one-click disconnect. */
export function ConnectedApps() {
  const { data, mutate, isLoading } = useSWR<{ grants: Grant[] }>("/api/account/apps", fetcher);
  const [confirm, setConfirm] = React.useState<string | null>(null);
  const [purge, setPurge] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const grants = data?.grants ?? [];

  const disconnect = async (g: Grant) => {
    setBusy(true);
    try {
      // Optional: delete the app's files too. Discord messages are removed from THIS device (it holds the webhook).
      if (purge) {
        const drive = await getDrive(g.driveId);
        if (!drive) throw new Error("Drive introuvable sur cet appareil.");
        const client = DiscordClient.fromUrl(drive.webhookUrl);
        for (const f of await getFolderSubtreeFiles(g.driveId, g.appFolderId)) await client.deleteFile(f);
        await hardDeleteFolderSubtree(g.driveId, g.appFolderId);
      }
      const res = await authFetch(`/api/account/apps/${g.id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error("Échec de la déconnexion.");
      toast.success(`${g.app.name} déconnectée${purge ? " et ses fichiers supprimés" : ""}.`);
      setConfirm(null);
      setPurge(false);
      void mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card data-testid="connected-apps">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Plug className="size-4 text-muted-foreground" /> Applications connectées</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Ces applications stockent des fichiers dans un dossier dédié de ton drive. Elles ne voient que du contenu chiffré et n&apos;ont accès ni à tes clés, ni au reste de ton drive.
        </p>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : grants.length === 0 ? (
          <p className="rounded-lg border border-border/60 bg-card/40 px-4 py-5 text-center text-sm text-muted-foreground">Aucune application connectée.</p>
        ) : (
          <ul className="space-y-2">
            {grants.map((g) => (
              <li key={g.id} className="space-y-2 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5">
                <div className="flex items-center gap-3">
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{g.app.name.charAt(0).toUpperCase()}</div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-medium">
                      {g.app.name}
                      {g.app.verified && <BadgeCheck className="size-3.5 text-emerald-500" />}
                      {g.scopes.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{SCOPE_FR[s] ?? s}</Badge>)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {g.driveName} · connectée le {new Date(g.createdAt).toLocaleDateString("fr-FR")}
                      {g.lastActivityAt ? ` · dernière activité le ${new Date(g.lastActivityAt).toLocaleDateString("fr-FR")}` : ""}
                    </p>
                  </div>
                  {confirm !== g.id && (
                    <Button size="icon" variant="ghost" className="size-8 text-red-400 hover:text-red-300" onClick={() => setConfirm(g.id)} aria-label={`Déconnecter ${g.app.name}`}>
                      <Trash2 className="size-4" />
                    </Button>
                  )}
                </div>
                {confirm === g.id && (
                  <div className="space-y-2 border-t border-border/40 pt-2">
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={purge} onChange={(e) => setPurge(e.target.checked)} />
                      Supprimer aussi tous les fichiers de cette application
                    </label>
                    <div className="flex gap-2">
                      <Button size="sm" variant="destructive" disabled={busy} onClick={() => disconnect(g)}>
                        {busy && <Loader2 className="size-3.5 animate-spin" />} Déconnecter
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setConfirm(null); setPurge(false); }}>Annuler</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">
          Tu développes une application ? <a href="/developers" className="underline hover:text-foreground">Espace développeur</a>
        </p>
      </CardContent>
    </Card>
  );
}
