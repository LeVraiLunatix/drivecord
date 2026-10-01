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
  expiresAt: string | null;
  revokedAt: string | null;
  ipRestricted: boolean;
  allowedOrigins: string[];
  driveId: string;
  driveName: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type Drive = { driveId: string; name: string };

const SCOPE_LABELS: Record<string, string> = {
  "files:read": "lecture",
  "files:write": "envoi",
  "files:delete": "suppression",
  "public:manage": "liens publics",
  "folders:write": "dossiers",
  // Keys created before the fine-grained scopes existed.
  read: "lecture (ancienne)",
  write: "écriture (ancienne)",
};

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 jours" },
  { value: "90", label: "90 jours" },
  { value: "365", label: "1 an" },
  { value: "never", label: "Jamais" },
];


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
  const [scopes, setScopes] = React.useState<Record<string, boolean>>({
    "files:read": true,
    "files:write": false,
    "files:delete": false,
    "folders:write": false,
    "public:manage": false,
  });
  const [expiry, setExpiry] = React.useState("90");
  const [ips, setIps] = React.useState("");
  const [origins, setOrigins] = React.useState("");
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
    const activeScopes = Object.keys(scopes).filter((s) => scopes[s]);
    const split = (v: string) =>
      v
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
    const allowedIps = split(ips);
    const allowedOrigins = split(origins);
    setBusy(true);
    const res = await authFetch("/api/settings/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        driveId,
        scopes: activeScopes,
        expiresInDays: expiry === "never" ? null : Number(expiry),
        allowedIps,
        allowedOrigins,
      }),
    });
    setBusy(false);
    if (res.ok) {
      const created = await res.json();
      setRevealed({ key: created.key, name: created.name });
      setName("");
      setIps("");
      setOrigins("");
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
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5">
            {(
              [
                ["files:read", "Lecture"],
                ["files:write", "Envoi de fichiers"],
                ["files:delete", "Suppression"],
                ["folders:write", "Création de dossiers"],
                ["public:manage", "Liens publics"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={scopes[key]}
                  onChange={(e) => setScopes((s) => ({ ...s, [key]: e.target.checked }))}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>Expiration</Label>
            <Select value={expiry} onValueChange={setExpiry}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-key-ips">Adresses IP autorisées (optionnel)</Label>
            <Input
              id="api-key-ips"
              placeholder="ex. 203.0.113.7, 2001:db8::1 — vide = toutes"
              value={ips}
              onChange={(e) => setIps(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="api-key-origins">Origines web autorisées (optionnel)</Label>
            <Input
              id="api-key-origins"
              placeholder="ex. https://monsite.fr — vide = toutes"
              value={origins}
              onChange={(e) => setOrigins(e.target.value)}
            />
            <p className="text-[11px] text-muted-foreground">
              Si tu appelles l&apos;API depuis un navigateur, restreins la clé à ton site.
            </p>
          </div>
          <Button
            size="sm"
            onClick={create}
            disabled={busy || !name.trim() || !driveId || !Object.values(scopes).some(Boolean)}
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
              className={`flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5 ${k.revokedAt ? "opacity-60" : ""}`}
            >
              <Code2 className="size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-1.5 truncate text-sm font-medium">
                  {k.name}
                  {k.revokedAt && (
                    <Badge variant="destructive" className="text-[10px]">
                      révoquée
                    </Badge>
                  )}
                  {k.scopes.map((s) => (
                    <Badge key={s} variant="secondary" className="text-[10px]">
                      {SCOPE_LABELS[s] ?? s}
                    </Badge>
                  ))}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {k.prefix}••••••••… · {k.driveName} · utilisée{" "}
                  {k.lastUsedAt ? `le ${formatDate(k.lastUsedAt)}` : "jamais"}
                  {k.expiresAt
                    ? ` · ${new Date(k.expiresAt) < new Date() ? "expirée" : "expire"} le ${formatDate(k.expiresAt)}`
                    : ""}
                  {k.ipRestricted ? " · IP restreintes" : ""}
                  {k.allowedOrigins.length > 0 ? ` · ${k.allowedOrigins.length} origine(s)` : ""}
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
                    {k.revokedAt ? "Supprimer" : "Révoquer"}
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
                  aria-label={`${k.revokedAt ? "Supprimer" : "Révoquer"} ${k.name}`}
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
