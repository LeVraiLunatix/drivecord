"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { authFetch, apiFetcher as fetcher } from "@/lib/api-base";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type TokenRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  driveId: string;
  driveName: string;
  allowedOrigins: string[];
  expiresAt: string | null;
  revokedAt: string | null;
  lastUsedAt: string | null;
};
type Drive = { driveId: string; name: string };

const SCOPES = [
  ["drive:read", "Lecture"],
  ["drive:write", "Écriture"],
  ["drive:delete", "Suppression"],
  ["drive:share", "Partage"],
] as const;

/** Pastille à bascule : remplace les cases à cocher et listes natives. */
function Chip({ active, children, onClick, role }: { active: boolean; children: React.ReactNode; onClick: () => void; role: "radio" | "checkbox" }) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={active}
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-all active:scale-95 ${active ? "border-violet-400/60 bg-gradient-to-r from-indigo-500/25 to-fuchsia-500/25 text-foreground shadow-[0_0_16px_-6px_rgba(168,85,247,0.8)]" : "border-border/60 text-muted-foreground hover:border-violet-400/40 hover:text-foreground"}`}
    >
      {children}
    </button>
  );
}

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" }) : "jamais");

/** API v2 personal access tokens: full-drive access (within their scopes), to the ciphertext only. */
export function PersonalTokensManager() {
  const { data, mutate, isLoading } = useSWR<{ tokens: TokenRow[] }>("/api/settings/personal-tokens", fetcher);
  const { data: drives } = useSWR<Drive[]>("/api/webhooks", fetcher);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [driveId, setDriveId] = React.useState("");
  const [scopes, setScopes] = React.useState<Record<string, boolean>>({ "drive:read": true });
  const [days, setDays] = React.useState("90");
  const [busy, setBusy] = React.useState(false);
  const [revealed, setRevealed] = React.useState<{ token: string; name: string } | null>(null);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const list = data?.tokens ?? [];
  const effectiveDrive = driveId || drives?.[0]?.driveId || "";

  const create = async () => {
    setBusy(true);
    const res = await authFetch("/api/settings/personal-tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), driveId: effectiveDrive, scopes: SCOPES.map(([s]) => s).filter((s) => scopes[s]), expiresInDays: days === "never" ? null : Number(days) }),
    });
    setBusy(false);
    if (res.ok) {
      const c = await res.json();
      setRevealed({ token: c.token, name: c.name });
      setName("");
      setOpen(false);
      mutate();
    } else {
      toast.error((await res.json().catch(() => ({}))).error ?? "Échec de la création.");
    }
  };

  const revoke = async (id: string) => {
    setConfirmId(null);
    const res = await authFetch(`/api/settings/personal-tokens/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      toast.success("Jeton révoqué.");
      mutate();
    } else toast.error("Échec de la révocation.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Jetons personnels</h3>
        </div>
        <Button size="sm" variant="outline" onClick={() => setOpen((v) => !v)} disabled={!drives?.length}>
          <Plus className="size-4" />
          Nouveau jeton
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Pour tes propres scripts et serveurs. Un jeton donne accès aux <strong>données chiffrées</strong> de ton drive : pour les lire, ton code doit aussi détenir la clé du drive
        (Drivecord ne la connaît jamais). Traite-le comme un mot de passe.{" "}
        <a href="/docs/technique/api-v2" className="underline hover:text-foreground">Documentation</a>.
      </p>

      {revealed && (
        <div className="space-y-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-3">
          <p className="text-xs font-medium text-violet-300">Jeton « {revealed.name} » créé — copie-le maintenant, il ne sera plus jamais affiché.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background/60 px-2 py-1.5 text-xs">{revealed.token}</code>
            <Button size="icon" variant="ghost" className="size-8 shrink-0" aria-label="Copier le jeton" onClick={() => { navigator.clipboard.writeText(revealed.token); toast.success("Copié."); }}>
              <Copy className="size-4" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>J&apos;ai copié le jeton</Button>
        </div>
      )}

      {open && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 px-3 py-3">
          <div className="space-y-1.5">
            <Label htmlFor="pat-name">Nom</Label>
            <Input id="pat-name" placeholder="ex. Sauvegarde nocturne" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>Drive</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Drive">
              {drives?.map((d) => (
                <Chip key={d.driveId} active={effectiveDrive === d.driveId} role="radio" onClick={() => setDriveId(d.driveId)}>
                  {d.name}
                </Chip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Permissions</Label>
            <div className="flex flex-wrap gap-1.5">
              {SCOPES.map(([key, label]) => (
                <Chip key={key} active={Boolean(scopes[key])} role="checkbox" onClick={() => setScopes((v) => ({ ...v, [key]: !v[key] }))}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Expiration</Label>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Expiration">
              {([["30", "30 jours"], ["90", "90 jours"], ["365", "1 an"], ["never", "Jamais"]] as const).map(([v, label]) => (
                <Chip key={v} active={days === v} role="radio" onClick={() => setDays(v)}>
                  {label}
                </Chip>
              ))}
            </div>
          </div>
          <Button size="sm" onClick={create} disabled={busy || !name.trim() || !effectiveDrive || !Object.values(scopes).some(Boolean)}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Créer le jeton
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : list.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">Aucun jeton personnel.</p>
      ) : (
        <ul className="space-y-2">
          {list.map((t) => (
            <li key={t.id} className={`flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 ${t.revokedAt ? "opacity-60" : ""}`}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                  {t.name}
                  {t.revokedAt && <Badge variant="destructive" className="text-[10px]">révoqué</Badge>}
                  {t.scopes.map((s) => <Badge key={s} variant="secondary" className="text-[10px]">{s.replace("drive:", "")}</Badge>)}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {t.prefix}••••… · {t.driveName} · utilisé {t.lastUsedAt ? `le ${fmt(t.lastUsedAt)}` : "jamais"}
                  {t.expiresAt ? ` · ${new Date(t.expiresAt) < new Date() ? "expiré" : "expire"} le ${fmt(t.expiresAt)}` : ""}
                </p>
              </div>
              {confirmId === t.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Sûr ?</span>
                  <Button size="sm" variant="destructive" className="h-7" onClick={() => revoke(t.id)}>{t.revokedAt ? "Supprimer" : "Révoquer"}</Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmId(null)}>Non</Button>
                </div>
              ) : (
                <Button size="icon" variant="ghost" className="size-8 text-red-400 hover:text-red-300" onClick={() => setConfirmId(t.id)} aria-label={`${t.revokedAt ? "Supprimer" : "Révoquer"} ${t.name}`}>
                  <Trash2 className="size-4" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
