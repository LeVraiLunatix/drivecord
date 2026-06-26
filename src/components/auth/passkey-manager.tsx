"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import {
  KeyRound,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { registerPasskey } from "@/lib/auth/passkey-client";

type Passkey = {
  id: string;
  name: string;
  deviceType: string | null;
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
};

const fetcher = (url: string) => fetch(url).then((r) => r.json());

function formatDate(iso: string | null): string {
  if (!iso) return "jamais";
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function PasskeyManager() {
  const { data, mutate, isLoading } = useSWR<{ passkeys: Passkey[] }>(
    "/api/settings/passkeys",
    fetcher,
  );
  const [adding, setAdding] = React.useState(false);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [editName, setEditName] = React.useState("");
  const [confirmId, setConfirmId] = React.useState<string | null>(null);

  const passkeys = data?.passkeys ?? [];

  const add = async () => {
    setAdding(true);
    const r = await registerPasskey();
    setAdding(false);
    if (r.ok) {
      toast.success("Passkey ajouté.");
      mutate();
    } else {
      toast.error(r.error ?? "Échec de l'ajout.");
    }
  };

  const rename = async (id: string) => {
    const name = editName.trim();
    setEditingId(null);
    if (!name) return;
    const res = await fetch(`/api/settings/passkeys/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (res.ok) {
      mutate();
    } else {
      toast.error("Échec du renommage.");
    }
  };

  const remove = async (id: string) => {
    setConfirmId(null);
    const res = await fetch(`/api/settings/passkeys/${id}`, { method: "DELETE" });
    if (res.ok || res.status === 204) {
      toast.success("Passkey supprimé.");
      mutate();
    } else {
      const d = await res.json().catch(() => ({}));
      toast.error(d.error ?? "Échec de la suppression.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Passkeys</h3>
        </div>
        <Button size="sm" variant="outline" onClick={add} disabled={adding}>
          {adding ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Plus className="size-4" />
          )}
          Ajouter
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        Connecte-toi sans mot de passe avec Face&nbsp;ID, Touch&nbsp;ID ou une clé
        de sécurité.
      </p>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : passkeys.length === 0 ? (
        <p className="rounded-lg border border-border/60 bg-card/40 px-4 py-6 text-center text-sm text-muted-foreground">
          Aucun passkey pour l&apos;instant.
        </p>
      ) : (
        <ul className="space-y-2">
          {passkeys.map((pk) => (
            <li
              key={pk.id}
              className="flex items-center gap-3 rounded-lg border border-border/60 bg-card/40 px-3 py-2.5"
            >
              <ShieldCheck className="size-4 shrink-0 text-violet-400" />
              <div className="min-w-0 flex-1">
                {editingId === pk.id ? (
                  <div className="flex items-center gap-1.5">
                    <Input
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="h-8"
                      autoFocus
                      aria-label="Nouveau nom du passkey"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") rename(pk.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                    />
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => rename(pk.id)}
                      aria-label="Confirmer"
                    >
                      <Check className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => setEditingId(null)}
                      aria-label="Annuler"
                    >
                      <X className="size-4" />
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="truncate text-sm font-medium">{pk.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Ajouté le {formatDate(pk.createdAt)} · utilisé{" "}
                      {pk.lastUsedAt ? `le ${formatDate(pk.lastUsedAt)}` : "jamais"}
                      {pk.backedUp ? " · synchronisé" : ""}
                    </p>
                  </>
                )}
              </div>

              {editingId !== pk.id &&
                (confirmId === pk.id ? (
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">Sûr ?</span>
                    <Button
                      size="sm"
                      variant="destructive"
                      className="h-7"
                      onClick={() => remove(pk.id)}
                    >
                      Supprimer
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
                  <div className="flex items-center gap-0.5">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8"
                      onClick={() => {
                        setEditingId(pk.id);
                        setEditName(pk.name);
                      }}
                      aria-label={`Renommer ${pk.name}`}
                    >
                      <Pencil className="size-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 text-red-400 hover:text-red-300"
                      onClick={() => setConfirmId(pk.id)}
                      aria-label={`Supprimer ${pk.name}`}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
