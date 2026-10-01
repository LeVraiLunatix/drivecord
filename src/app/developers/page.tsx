"use client";

import * as React from "react";
import useSWR from "swr";
import { Code2, Copy, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BackButton } from "@/components/back-button";
import { authFetch, apiFetcher as fetcher } from "@/lib/api-base";

type DevApp = {
  id: string; name: string; homepageUrl: string; iconUrl: string | null; redirectUris: string[];
  allowedOrigins: string[]; confidential: boolean; verified: boolean; connectedUsers: number; createdAt: string;
};

const lines = (v: string) => v.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);

export default function DevelopersPage() {
  const { data, mutate, isLoading } = useSWR<{ apps: DevApp[] }>("/api/developers/apps", fetcher);
  const [form, setForm] = React.useState({ name: "", homepageUrl: "https://", redirectUris: "", allowedOrigins: "", confidential: false });
  const [busy, setBusy] = React.useState(false);
  const [secret, setSecret] = React.useState<{ app: string; value: string } | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);
  const [edit, setEdit] = React.useState({ redirectUris: "", allowedOrigins: "" });

  const call = async (path: string, init: RequestInit) => {
    const res = await authFetch(path, { ...init, headers: { "Content-Type": "application/json", ...init.headers } });
    const d = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 204) throw new Error(d.error ?? "Échec.");
    return d;
  };

  const create = async () => {
    setBusy(true);
    try {
      const d = await call("/api/developers/apps", {
        method: "POST",
        body: JSON.stringify({ ...form, redirectUris: lines(form.redirectUris), allowedOrigins: lines(form.allowedOrigins) }),
      });
      if (d.clientSecret) setSecret({ app: d.app.name, value: d.clientSecret });
      setForm({ name: "", homepageUrl: "https://", redirectUris: "", allowedOrigins: "", confidential: false });
      toast.success("Application créée.");
      void mutate();
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const copy = (t: string) => { void navigator.clipboard.writeText(t); toast.success("Copié."); };

  return (
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 px-5 pb-20 pt-6">
      <BackButton fallback="/settings" className="w-fit" />
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight"><Code2 className="size-7 text-primary" /> Développeurs</h1>
        <p className="text-sm text-muted-foreground">
          Crée une application pour que tes utilisateurs stockent des fichiers <strong>dans leur propre drive</strong> Drivecord, sans que tu puisses les lire.{" "}
          <a className="underline" href="/docs/technique/api-v2">Documentation</a>
        </p>
      </header>

      {secret && (
        <div className="space-y-2 rounded-lg border border-violet-500/40 bg-violet-500/10 p-3" data-testid="client-secret">
          <p className="text-xs font-medium text-violet-300">Secret client de « {secret.app} » — copie-le maintenant, il ne sera plus jamais affiché.</p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background/60 px-2 py-1.5 text-xs">{secret.value}</code>
            <Button size="icon" variant="ghost" className="size-8" onClick={() => copy(secret.value)} aria-label="Copier"><Copy className="size-4" /></Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setSecret(null)}>J&apos;ai copié le secret</Button>
        </div>
      )}

      <Card>
        <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-base"><Plus className="size-4" /> Nouvelle application</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-1.5"><Label htmlFor="name">Nom</Label><Input id="name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Wavecast" /></div>
          <div className="space-y-1.5"><Label htmlFor="home">Site web</Label><Input id="home" value={form.homepageUrl} onChange={(e) => setForm({ ...form, homepageUrl: e.target.value })} /></div>
          <div className="space-y-1.5"><Label htmlFor="redir">URI de redirection (une par ligne, correspondance exacte)</Label>
            <textarea id="redir" className="min-h-16 w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={form.redirectUris} onChange={(e) => setForm({ ...form, redirectUris: e.target.value })} placeholder="https://wavecast.fm/oauth/callback" /></div>
          <div className="space-y-1.5"><Label htmlFor="orig">Origines autorisées (SDK / appels navigateur)</Label>
            <Input id="orig" value={form.allowedOrigins} onChange={(e) => setForm({ ...form, allowedOrigins: e.target.value })} placeholder="https://wavecast.fm" /></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.confidential} onChange={(e) => setForm({ ...form, confidential: e.target.checked })} /> Client confidentiel (génère un secret — pour un serveur)</label>
          <Button onClick={create} disabled={busy || !form.name.trim() || !form.redirectUris.trim()}>{busy && <Loader2 className="size-4 animate-spin" />} Créer</Button>
        </CardContent>
      </Card>

      {isLoading ? <p className="text-sm text-muted-foreground">Chargement…</p> : (
        <ul className="space-y-3">
          {(data?.apps ?? []).map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="space-y-3 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{a.name}</span>
                    {a.verified && <Badge>vérifiée</Badge>}
                    <Badge variant="secondary">{a.confidential ? "confidentiel" : "public (PKCE)"}</Badge>
                    <Badge variant="outline">{a.connectedUsers} utilisateur{a.connectedUsers > 1 ? "s" : ""}</Badge>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="text-muted-foreground">client_id</span>
                    <code className="truncate rounded bg-muted px-1.5 py-0.5">{a.id}</code>
                    <Button size="icon" variant="ghost" className="size-6" onClick={() => copy(a.id)} aria-label="Copier le client_id"><Copy className="size-3" /></Button>
                  </div>
                  {editing === a.id ? (
                    <div className="space-y-2">
                      <textarea className="min-h-16 w-full rounded-md border border-border bg-background px-3 py-2 text-xs" value={edit.redirectUris} onChange={(e) => setEdit({ ...edit, redirectUris: e.target.value })} />
                      <Input value={edit.allowedOrigins} onChange={(e) => setEdit({ ...edit, allowedOrigins: e.target.value })} placeholder="Origines autorisées" />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={async () => { try { await call(`/api/developers/apps/${a.id}`, { method: "PATCH", body: JSON.stringify({ redirectUris: lines(edit.redirectUris), allowedOrigins: lines(edit.allowedOrigins) }) }); setEditing(null); void mutate(); toast.success("Enregistré."); } catch (e) { toast.error((e as Error).message); } }}>Enregistrer</Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>Annuler</Button>
                      </div>
                    </div>
                  ) : (
                    <ul className="space-y-0.5 text-xs text-muted-foreground">{a.redirectUris.map((u) => <li key={u} className="truncate">↳ {u}</li>)}</ul>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditing(a.id); setEdit({ redirectUris: a.redirectUris.join("\n"), allowedOrigins: a.allowedOrigins.join(" ") }); }}>Modifier</Button>
                    {a.confidential && (
                      <Button size="sm" variant="outline" className="gap-1.5" onClick={async () => { if (!confirm("Régénérer le secret ? L'ancien cessera de fonctionner immédiatement.")) return; try { const d = await call(`/api/developers/apps/${a.id}/secret`, { method: "POST" }); setSecret({ app: a.name, value: d.clientSecret }); } catch (e) { toast.error((e as Error).message); } }}>
                        <RefreshCw className="size-3.5" /> Régénérer le secret
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="gap-1.5 text-red-400" onClick={async () => { if (!confirm(`Désactiver « ${a.name} » ? Tous ses accès seront révoqués.`)) return; try { await call(`/api/developers/apps/${a.id}`, { method: "DELETE" }); void mutate(); } catch (e) { toast.error((e as Error).message); } }}>
                      <Trash2 className="size-3.5" /> Désactiver
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
