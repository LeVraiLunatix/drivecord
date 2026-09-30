"use client";

import * as React from "react";
import useSWR from "swr";
import { toast } from "sonner";
import { Flag, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

type Report = {
  token: string;
  disabled: boolean;
  filename: string | null;
  mimeType: string | null;
  size: number | null;
  count: number;
  lastReportAt: string;
  reasons: string[];
};

const fetcher = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(String(res.status));
  return res.json();
};

/** Panneau admin : signalements de liens publics (désactiver le lien ou classer). */
export function ReportsAdmin() {
  const { data, mutate } = useSWR<{ reports: Report[] }>("/api/admin/reports", fetcher, {
    revalidateOnFocus: false,
  });
  const [busy, setBusy] = React.useState<string | null>(null);

  const act = async (token: string, action: "disable" | "dismiss") => {
    setBusy(token);
    try {
      const res = await fetch(`/api/admin/reports/${encodeURIComponent(token)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Échec");
      toast.success(action === "disable" ? "Lien désactivé." : "Signalement classé.");
      mutate();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const reports = data?.reports ?? [];
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Flag className="size-4 text-muted-foreground" />
          <h3 className="text-sm font-medium">Liens signalés</h3>
          {reports.length > 0 && <Badge variant="destructive">{reports.length}</Badge>}
        </div>
        {reports.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucun signalement en attente.</p>
        ) : (
          <ul className="space-y-2">
            {reports.map((r) => (
              <li key={r.token} className="space-y-2 rounded-lg border border-border/60 px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{r.filename ?? "(fichier supprimé)"}</span>
                  <Badge variant="secondary" className="text-[10px]">{r.count} signalement(s)</Badge>
                  {r.disabled && <Badge variant="destructive" className="text-[10px]">désactivé</Badge>}
                </div>
                <ul className="list-inside list-disc text-xs text-muted-foreground">
                  {r.reasons.map((reason, i) => (
                    <li key={i} className="break-words">{reason}</li>
                  ))}
                </ul>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7"
                    disabled={busy === r.token || r.disabled}
                    onClick={() => act(r.token, "disable")}
                  >
                    {busy === r.token && <Loader2 className="size-3 animate-spin" />}
                    Désactiver le lien
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" disabled={busy === r.token} onClick={() => act(r.token, "dismiss")}>
                    Classer
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
