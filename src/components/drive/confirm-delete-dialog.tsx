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
  /** True in the trash: deleting there is final. */
  permanent?: boolean;
};

export function ConfirmDeleteDialog({ item, onOpenChange, onConfirm, permanent = false }: Props) {
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
            {permanent ? "Supprimer définitivement" : "Mettre à la corbeille"} {isFolder ? "ce dossier" : "ce fichier"} ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              {permanent ? (
                <>
                  <p>
                    <span className="font-mono">{name}</span>
                    {isFolder ? " et tout son contenu seront supprimés" : " sera supprimé"} définitivement.
                  </p>
                  <p>Les données sont aussi effacées sur Discord. Cette action est irréversible.</p>
                </>
              ) : (
                <>
                  <p>
                    <span className="font-mono">{name}</span>
                    {isFolder ? " et son contenu seront déplacés" : " sera déplacé"} dans la corbeille.
                  </p>
                  <p>Tu pourras le restaurer à tout moment depuis la corbeille.</p>
                </>
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
            {permanent ? "Supprimer définitivement" : "Mettre à la corbeille"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
