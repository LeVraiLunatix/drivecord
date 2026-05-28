"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createFolder, type ParentId } from "@/lib/storage";
import { toast } from "sonner";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  driveId: string;
  parentId: ParentId;
};

export function NewFolderDialog({ open, onOpenChange, driveId, parentId }: Props) {
  const [name, setName] = React.useState("Nouveau dossier");
  const [busy, setBusy] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (open) {
      setName("Nouveau dossier");
      // Select all so the user can immediately type a name.
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await createFolder({ driveId, parentId, name });
      toast.success(`Dossier « ${name.trim()} » créé`);
      onOpenChange(false);
    } catch (err) {
      toast.error(`Création impossible : ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nouveau dossier</DialogTitle>
          <DialogDescription>
            Crée un dossier virtuel pour organiser tes fichiers. Discord n&apos;a
            pas de notion de dossiers — c&apos;est une vue côté Discloud.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="folder-name">Nom</Label>
          <Input
            ref={inputRef}
            id="folder-name"
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
            Créer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
