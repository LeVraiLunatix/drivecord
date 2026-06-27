"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Megaphone, Loader2, TriangleAlert, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

type Announcement = {
  id: string;
  title: string;
  body: string;
  important: boolean;
  expiresAt: string;
  createdAt: string;
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

const UNITS = [
  { label: "heures", ms: 60 * 60 * 1000 },
  { label: "jours", ms: 24 * 60 * 60 * 1000 },
  { label: "semaines", ms: 7 * 24 * 60 * 60 * 1000 },
];

/** Panneau admin : composer/publier/désactiver l'annonce affichée en popup. */
export function AnnouncementAdmin() {
  const { data, mutate } = useSWR<{ announcement: Announcement | null }>(
    "/api/admin/announcement",
    fetcher,
    { revalidateOnFocus: false },
  );
  const active =
    data?.announcement && new Date(data.announcement.expiresAt) > new Date()
      ? data.announcement
      : null;

  const [title, setTitle] = React.useState("");
  const [body, setBody] = React.useState("");
  const [important, setImportant] = React.useState(false);
  const [amount, setAmount] = React.useState(7);
  const [unitIdx, setUnitIdx] = React.useState(1); // jours
  const [busy, setBusy] = React.useState(false);

  const publish = async () => {
    if (!title.trim() || !body.trim()) {
      toast.error("Titre et description requis.");
      return;
    }
    const durationMs = Math.round(amount * UNITS[unitIdx].ms);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/announcement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, important, durationMs }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error ?? "Échec");
      toast.success("Annonce publiée.");
      setTitle("");
      setBody("");
      setImportant(false);
      mutate();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/announcement", { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Annonce désactivée.");
      mutate();
    } catch {
      toast.error("Échec de la désactivation.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="size-4 text-primary" />
          Annonce (popup du site)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {active ? (
          <div className="flex items-start gap-2 rounded-lg border border-border/50 bg-background/40 p-3 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-green-400" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">Active : « {active.title} »</p>
              <p className="text-xs text-muted-foreground">
                Visible jusqu&apos;au {new Date(active.expiresAt).toLocaleString("fr")}
                {active.important ? " · importante" : ""}
              </p>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={deactivate}
              disabled={busy}
            >
              Désactiver
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Aucune annonce active. Compose-en une ci-dessous.
          </p>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="ann-title">Titre</Label>
          <Input
            id="ann-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex : Maintenance prévue"
            maxLength={120}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="ann-body">Description</Label>
          <textarea
            id="ann-body"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={4}
            maxLength={2000}
            placeholder="Détaille l'annonce…"
            className="w-full resize-y rounded-md border border-border/50 bg-background/40 px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
          />
        </div>

        <button
          type="button"
          onClick={() => setImportant((v) => !v)}
          aria-pressed={important}
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition",
            important
              ? "border-amber-500/50 bg-amber-500/10"
              : "border-border/50 hover:bg-accent/60",
          )}
        >
          <span className="flex items-center gap-2">
            <TriangleAlert
              className={cn(
                "size-4",
                important ? "text-amber-400" : "text-muted-foreground",
              )}
            />
            Marquer comme importante
          </span>
          <span
            className={cn(
              "flex h-5 w-9 items-center rounded-full p-0.5 transition-colors",
              important ? "bg-amber-500" : "bg-border",
            )}
          >
            <span
              className={cn(
                "size-4 rounded-full bg-white transition-transform",
                important && "translate-x-4",
              )}
            />
          </span>
        </button>

        <div className="space-y-1.5">
          <Label>Durée d&apos;affichage</Label>
          <div className="flex gap-2">
            <Input
              type="number"
              min={1}
              value={amount}
              onChange={(e) => setAmount(Math.max(1, Number(e.target.value) || 1))}
              className="w-24"
            />
            <select
              value={unitIdx}
              onChange={(e) => setUnitIdx(Number(e.target.value))}
              className="flex-1 rounded-md border border-border/50 bg-background/40 px-3 text-sm outline-none transition focus:border-primary"
            >
              {UNITS.map((u, i) => (
                <option key={u.label} value={i} className="bg-background text-foreground">
                  {u.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            Au-delà, la popup ne s&apos;affiche plus.
          </p>
        </div>

        <Button onClick={publish} disabled={busy} className="w-full gap-2 sm:w-auto">
          {busy && <Loader2 className="size-4 animate-spin" />}
          {active ? "Remplacer l'annonce" : "Publier l'annonce"}
        </Button>
      </CardContent>
    </Card>
  );
}
