"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, BadgeCheck, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { authFetch } from "@/lib/api-base";
import { useAllDrives, createFolder, type FolderEntry } from "@/lib/storage";
import { decryptPayload } from "@/lib/e2ee-client/decrypt-items";
import { useKeyring } from "@/components/e2ee/use-keyring";

type ConsentData = {
  app: { id: string; name: string; iconUrl: string | null; homepageUrl: string; verified: boolean };
  scopes: { scope: string; label: string }[];
  drives: { driveId: string; name: string; e2eeVersion: number }[];
  existingGrant: { driveId: string; appFolderId: string } | null;
};

const APPS_FOLDER = "Apps";
const safeFolderName = (name: string) => name.replace(/[\\/\u0000-\u001f]/g, " ").trim().slice(0, 80) || "Application";

async function listChildren(driveId: string, parentId: string): Promise<FolderEntry[]> {
  const res = await authFetch(`/api/drive/${driveId}/items?parentId=${encodeURIComponent(parentId)}`);
  if (!res.ok) throw new Error("Impossible de lire ton drive.");
  const data = await decryptPayload(driveId, `/api/drive/${driveId}/items?parentId=`, await res.json());
  return (data.items as (FolderEntry & { kind: string })[]).filter((i) => i.kind === "folder");
}

/** Find the folder called `name` under `parentId`, or create it. */
async function ensureFolder(driveId: string, parentId: string, name: string): Promise<string> {
  const hit = (await listChildren(driveId, parentId)).find((f) => f.name === name);
  return hit ? hit.id : createFolder({ driveId, parentId, name });
}

export default function AuthorizePage() {
  const params = useSearchParams();
  const { status: keyStatus } = useKeyring();
  const localDrives = useAllDrives();
  const [data, setData] = React.useState<ConsentData | null>(null);
  const [fatal, setFatal] = React.useState<string | null>(null);
  const [driveId, setDriveId] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const query = params.toString();
  const requestBody = React.useMemo(() => {
    const p = new URLSearchParams(query);
    return {
      client_id: p.get("client_id") ?? "", redirect_uri: p.get("redirect_uri") ?? "", response_type: p.get("response_type") ?? "",
      code_challenge: p.get("code_challenge") ?? "", code_challenge_method: p.get("code_challenge_method") ?? "",
      scope: p.get("scope") ?? "", ...(p.get("state") ? { state: p.get("state")! } : {}),
    };
  }, [query]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await authFetch(`/api/oauth/authorize?${query}`);
      const d = await res.json().catch(() => ({}));
      if (cancelled) return;
      if (res.ok) {
        setData(d);
        setDriveId(d.existingGrant?.driveId ?? d.drives.find((x: { e2eeVersion: number }) => x.e2eeVersion >= 1)?.driveId ?? "");
      } else if (d.redirectUrl) {
        window.location.replace(d.redirectUrl); // reportable error → tell the app
      } else {
        setFatal(d.error_description ?? d.error ?? "Requête d'autorisation invalide.");
      }
    })();
    return () => { cancelled = true; };
  }, [query]);

  const decide = async (approve: boolean) => {
    if (!data) return;
    setBusy(true);
    setError("");
    try {
      let appFolderId: string | undefined;
      if (approve) {
        if (!driveId) throw new Error("Choisis un drive.");
        appFolderId =
          data.existingGrant?.driveId === driveId
            ? data.existingGrant.appFolderId
            : await ensureFolder(driveId, await ensureFolder(driveId, "", APPS_FOLDER), safeFolderName(data.app.name));
      }
      const res = await authFetch("/api/oauth/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...requestBody, approve, driveId, appFolderId }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error_description ?? d.error ?? "Échec.");
      window.location.assign(d.redirectUrl);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  if (fatal) {
    return (
      <Shell>
        <div className="space-y-3 text-center" data-testid="authorize-fatal">
          <AlertTriangle className="mx-auto size-9 text-destructive" />
          <h1 className="text-lg font-semibold">Demande impossible</h1>
          <p className="text-sm text-muted-foreground">{fatal}</p>
          <p className="text-xs text-muted-foreground">Par sécurité, tu n&apos;as pas été redirigé vers l&apos;application.</p>
        </div>
      </Shell>
    );
  }
  if (!data || keyStatus !== "unlocked") {
    return <Shell><Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" /></Shell>;
  }

  const eligible = data.drives.filter((d) => d.e2eeVersion >= 1 && (localDrives ?? []).some((l) => l.id === d.driveId));

  return (
    <Shell>
      <div className="space-y-5" data-testid="authorize-consent">
        <div className="flex items-center gap-3">
          {data.app.iconUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={data.app.iconUrl} alt="" referrerPolicy="no-referrer" className="size-12 rounded-xl object-cover" />
          ) : (
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary/10 text-lg font-semibold text-primary">{data.app.name.charAt(0).toUpperCase()}</div>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold" data-testid="app-name">{data.app.name}</h1>
            <p className="truncate text-xs text-muted-foreground">{new URL(data.app.homepageUrl).host}</p>
          </div>
          {data.app.verified ? (
            <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-xs text-emerald-500"><BadgeCheck className="size-3.5" /> Vérifiée</span>
          ) : (
            <span className="ml-auto rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-500" data-testid="unverified">Non vérifiée</span>
          )}
        </div>

        <p className="text-sm">
          <strong>{data.app.name}</strong> demande la permission d&apos;utiliser ton drive Drivecord pour stocker les fichiers que tu lui confies :
        </p>
        <ul className="space-y-1.5 text-sm">
          {data.scopes.map((s) => (
            <li key={s.scope} className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-primary" />{s.label}</li>
          ))}
        </ul>
        <div className="rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <strong className="text-foreground">Cette app ne pourra pas lire le contenu de tes fichiers</strong> : elle ne reçoit que des données chiffrées,
          uniquement dans son dossier « {APPS_FOLDER} › {safeFolderName(data.app.name)} », et n&apos;a accès à aucune de tes clés ni au reste de ton drive.
        </div>

        <div className="space-y-1.5">
          <label htmlFor="drive" className="text-sm font-medium">Drive à utiliser</label>
          {eligible.length > 0 ? (
            <select id="drive" value={driveId} onChange={(e) => setDriveId(e.target.value)} className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm">
              {eligible.map((d) => <option key={d.driveId} value={d.driveId}>{d.name}</option>)}
            </select>
          ) : (
            <p className="text-sm text-destructive">Aucun drive chiffré de bout en bout disponible. Ajoute-en un depuis les réglages.</p>
          )}
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" className="flex-1" onClick={() => decide(false)} disabled={busy} data-testid="deny">Refuser</Button>
          <Button className="flex-1" onClick={() => decide(true)} disabled={busy || !driveId} data-testid="allow">
            {busy && <Loader2 className="size-4 animate-spin" />} Autoriser
          </Button>
        </div>
        <p className="text-center text-[11px] text-muted-foreground">Tu pourras révoquer cet accès à tout moment dans Réglages › Applications connectées.</p>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center p-4">
      <Card className="w-full max-w-md"><CardContent className="p-6">{children}</CardContent></Card>
    </div>
  );
}
