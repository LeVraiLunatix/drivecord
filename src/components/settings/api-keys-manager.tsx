"use client";

import * as React from "react";
import { authFetch, apiFetcher as fetcher } from "@/lib/api-base";
import useSWR from "swr";
import { toast } from "sonner";
import { Code2, Copy, Plus, Trash2, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type ApiKeyRow = {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  driveId: string;
  driveName: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type Drive = { driveId: string; name: string };


function formatDate(iso: string | null): string {
  if (!iso) return "jamais";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function ApiKeysManager() {
  const { data, mutate, isLoading } = useSWR<{ keys: ApiKeyRow[] }>(
    "/api/settings/api-keys",
    fetcher,
  );
  const { data: drivesData } = useSWR<Drive[]>("/api/webhooks", fetcher);

  const [showForm, setShowForm] = React.useState(false);
  const [name, setName] = React.useState("");
  const [driveId, setDriveId] = React.useState("");
  const [scopes, setScopes] = React.useState<{ read: boolean; write: boolean }>({
    read: true,
    write: true,
  });
  const [busy, setBusy] = React.useState(false);
  const [confirmId, setConfirmId] = React.useState<string | null>(null);
  const [revealed, setRevealed] = React.useState<{ key: string; name: string } | null>(null);

  const keys = data?.keys ?? [];
  const drives = drivesData ?? [];

  React.useEffect(() => {
    if (!driveId && drives.length > 0) setDriveId(drives[0].driveId);
  }, [drives, driveId]);

  const create = async () => {
    if (!name.trim() || !driveId) return;
    const activeScopes = [
      ...(scopes.read ? ["read"] : []),
      ...(scopes.write ? ["write"] : []),
    ];
    setBusy(true);
    const res = await authFetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name.trim(), driveId, scopes: activeScopes }),
    });
    setBusy(false);
    if (res.ok) {
      const created = await res.json();
      setRevealed({ key: created.key, name: created.name });
      setName("");
      setShowForm(false);
      mutate();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Échec de la création.");
    }
  };

  const revoke = async (id: string) => {
    setConfirmId(null);
    const res = await authFetch(`/api/settings/api-keys/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      toast.success("Clé révoquée.");
      mutate();
    } else {
      toast.error("Échec de la révocation.");
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success("Copié.");
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Code2 className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">API pour développeurs</h3>
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowForm((v) => !v)}
          disabled={drives.length === 0}
        >
          <Plus className="size-4" />
          Nouvelle clé
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Génère une clé API pour intégrer un drive directement dans un autre site
        (upload, lecture, suppression de fichiers) sans passer par cette
        interface.{" "}
        <a href="/docs/technique/api" className="underline hover:text-foreground">
          Voir la documentation
        </a>
        .
      </p>

      {drives.length === 0 && !isLoading && (
        <p className="rounded-lg border border-border/60 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Connecte d&apos;abord un drive (webhook Discord) pour pouvoir créer une
          clé API.
        </p>
      )}

      {revealed && (
        <div className="space-y-2 rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 py-3">
          <p className="text-xs font-medium text-violet-300">
            Clé « {revealed.name} » créée — copie-la maintenant, elle ne sera
            plus jamais affichée.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 truncate rounded bg-background/60 px-2 py-1.5 text-xs">
              {revealed.key}
            </code>
            <Button
              size="icon"
              variant="ghost"
              className="size-8 shrink-0"
              onClick={() => copy(revealed.key)}
              aria-label="Copier la clé"
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>
            J&apos;ai copié la clé
          </Button>
        </div>
      )}

      {showForm && drives.length > 0 && (
        <div className="space-y-3 rounded-lg border border-border/60 bg-card/40 px-3 py-3">
          <div className="space-y-1.5">
            <Label htmlFor="api-key-name">Nom</Label>
            <Input
              id="api-key-name"
              placeholder="ex. Site vitrine"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>Drive</Label>
            <Select value={driveId} onValueChange={setDriveId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Choisir un drive" />
              </SelectTrigger>
              <SelectContent>
                {drives.map((d) => (
                  <SelectItem key={d.driveId} value={d.driveId}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={scopes.read}
                onChange={(e) => setScopes((s) => ({ ...s, read: e.target.checked }))}
              />
              Lecture
            </label>
            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={scopes.write}
                onChange={(e) => setScopes((s) => ({ ...s, write: e.target.checked }))}
              />
              Écriture (upload + suppression)
            </label>
          </div>
          <Button
            size="sm"
            onClick={create}
            disabled={busy || !name.trim() || !driveId || (!scopes.read && !scopes.write)}
          >
            {busy && <Loader2 className="size-4 animate-spin" />}
            Créer la clé
          </Button>
        </div>
      )}

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : keys.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucune clé API pour l&apos;instant.
        </p>
      ) : (
        <ul className="space-y-2">
          {keys.map((k) => (
            <li
              key={k.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
            >
              <Code2 className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
                  {k.name}
                  {k.scopes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">
                      {s === "read" ? "lecture" : "écriture"}
                    </Badge>
                  ))}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {k.prefix}••••••••… · {k.driveName} · utilisée{" "}
                  {k.lastUsedAt ? `le ${formatDate(k.lastUsedAt)}` : "jamais"}
                </p>
              </div>

              {confirmId === k.id ? (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">Sûr ?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7"
                    onClick={() => revoke(k.id)}
                  >
                    Révoquer
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7"
                    onClick={() => setConfirmId(null)}
                  >
                    Non
                  </Button>
                </div>
              ) : (
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-8 text-red-400 hover:text-red-300"
                  onClick={() => setConfirmId(k.id)}
                  aria-label={`Révoquer ${k.name}`}
                >
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
