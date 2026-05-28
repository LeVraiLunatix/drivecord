"use client";

import * as React from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { DriveItem } from "@/lib/storage";

type Props = {
  item: DriveItem | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (item: DriveItem) => Promise<void>;
};

export function ConfirmDeleteDialog({ item, onOpenChange, onConfirm }: Props) {
  const open = item !== null;
  const [busy, setBusy] = React.useState(false);
  if (!item) return null;

  const name = item.kind === "folder" ? item.name : item.filename;
  const isFolder = item.kind === "folder";

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(item);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Supprimer {isFolder ? "ce dossier" : "ce fichier"} ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                <span className="font-mono">{name}</span> sera supprimé
                définitivement.
              </p>
              {!isFolder && (
                <p>
                  Tous les chunks correspondants seront aussi effacés sur
                  Discord. Cette action est irréversible.
                </p>
              )}
              {isFolder && (
                <p>
                  Le dossier sera retiré, mais son contenu reste accessible —
                  je le déplacerai à la racine plus tard.
                </p>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Annuler</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={busy}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            Supprimer
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
