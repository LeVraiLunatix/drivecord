"use client";

import * as React from "react";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { saveBlobWithToast } from "@/lib/native-save";

/** The recovery key as 13 groups of 4, with copy / download helpers. Shown ONCE. */
export function RecoveryKeyDisplay({ groups }: { groups: string[] }) {
  const text = groups.join("-");
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Clé copiée.");
    } catch {
      toast.error("Copie impossible : recopie-la à la main.");
    }
  };
  const download = () => {
    const blob = new Blob(
      [`Clé de récupération Drivecord\n\n${text}\n\nConserve ce fichier hors de ton ordinateur (coffre de mots de passe, papier).\nSans cette clé, tes fichiers sont perdus si tu perds tous tes appareils.\n`],
      { type: "text/plain" },
    );
    // saveBlob: in the iOS app an <a download> silently did nothing — the
    // recovery key was never saved while the user believed it was.
    void saveBlobWithToast(blob, "drivecord-cle-de-recuperation.txt", "text/plain");
  };
  return (
    <div className="space-y-3">
      <div
        data-testid="recovery-key"
        className="grid grid-cols-3 gap-2 rounded-lg border border-border/60 bg-muted/40 p-3 font-mono text-sm tracking-wider sm:grid-cols-4"
      >
        {groups.map((g, i) => (
          <span key={i} className="text-center">
            <span className="mr-1 text-[10px] text-muted-foreground">{i + 1}</span>
            {g}
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={copy}>
          <Copy className="size-4" /> Copier
        </Button>
        <Button type="button" size="sm" variant="outline" className="gap-1.5" onClick={download}>
          <Download className="size-4" /> Télécharger
        </Button>
      </div>
    </div>
  );
}
