"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { renameFile, renameFolder, type DriveItem } from "@/lib/storage";
import { toast } from "sonner";

type Props = {
  item: DriveItem | null;
  onOpenChange: (open: boolean) => void;
};

export function RenameDialog({ item, onOpenChange }: Props) {
  const open = item !== null;
  const original = item?.kind === "folder" ? item.name : item?.filename ?? "";
  const [name, setName] = React.useState(original);
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setName(original);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        // Preserve extension when renaming files (select base name only).
        if (item?.kind === "file") {
          const dot = original.lastIndexOf(".");
          if (dot > 0) input.setSelectionRange(0, dot);
          else input.select();
        } else {
          input.select();
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item?.id]);

  if (!item) return null;

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed || trimmed === original) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      if (item.kind === "folder") await renameFolder(item.driveId, item.id, trimmed);
      else await renameFile(item.driveId, item.id, trimmed);
      toast.success("Renommé");
      onOpenChange(false);
    } catch (err) {
      toast.error(`Renommage impossible : ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Renommer {item.kind === "folder" ? "le dossier" : "le fichier"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="rename-name">Nom</Label>
          <Input
            ref={inputRef}
            id="rename-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            autoFocus
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            Renommer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
