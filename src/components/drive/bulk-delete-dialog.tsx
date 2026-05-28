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
  items: DriveItem[];
  /** true = permanent delete (from trash), false = move to trash */
  permanent?: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (items: DriveItem[]) => Promise<void>;
};

export function BulkDeleteDialog({
  items,
  permanent = false,
  onOpenChange,
  onConfirm,
}: Props) {
  const open = items.length > 0;
  const [busy, setBusy] = React.useState(false);

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm(items);
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  const folders = items.filter((i) => i.kind === "folder").length;
  const files = items.filter((i) => i.kind === "file").length;
  const summary = [
    folders > 0 ? `${folders} dossier${folders > 1 ? "s" : ""}` : "",
    files > 0 ? `${files} fichier${files > 1 ? "s" : ""}` : "",
  ]
    .filter(Boolean)
    .join(" et ");

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {permanent ? "Supprimer définitivement" : "Mettre à la corbeille"}{" "}
            {items.length} élément{items.length > 1 ? "s" : ""} ?
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Tu t'apprêtes à supprimer {summary}.
              </p>
              {permanent && (
                <p className="text-destructive">
                  Suppression définitive — les fichiers Discord associés seront
                  également effacés. Cette action est irréversible.
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
            {permanent ? "Supprimer définitivement" : "Mettre à la corbeille"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
