"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

import { useAppearance } from "@/lib/appearance";
import { DriveBackdrop } from "@/components/drive/drive-backdrop";
import { DriveSidebar } from "@/components/drive/sidebar";
import { DriveNativeMenu } from "@/components/drive/native-menu";
import { DriveNav } from "@/components/drive/drive-nav";
import { DrivePageHead } from "@/components/drive/drive-page-head";
import { DriveDock } from "@/components/drive/dock";
import { DriveHome } from "@/components/drive/drive-home";
import type { DriveSection } from "@/components/drive/sections";
import { CommandPalette } from "@/components/drive/command-palette";
import { ShareDialog } from "@/components/drive/share-dialog";
import { entriesFromFiles, ensureFolderTree, type UploadEntry } from "@/lib/upload-folder";
import { createFolder, refreshDrive } from "@/lib/storage";
import { convertFileToE2ee } from "@/lib/e2ee-client/convert";
import { downloadZipWithToast } from "@/lib/download-zip";
import { downloadFileWithToast } from "@/lib/download-file";
import { getVaultKey, clearVaultKey } from "@/lib/crypto/vault-key-store";
import { ensureDriveKey } from "@/lib/auth/sync";
import { DriveExplorer, type BulkAction } from "@/components/drive/explorer";
import { NewFolderDialog } from "@/components/drive/new-folder-dialog";
import { RenameDialog } from "@/components/drive/rename-dialog";
import { ConfirmDeleteDialog } from "@/components/drive/confirm-delete-dialog";
import { MoveDialog } from "@/components/drive/move-dialog";
import { TagDialog } from "@/components/drive/tag-dialog";
import { ColorPickerDialog } from "@/components/drive/color-picker-dialog";
import { BulkDeleteDialog } from "@/components/drive/bulk-delete-dialog";
import { BulkTagDialog } from "@/components/drive/bulk-tag-dialog";
import { PreviewModal } from "@/components/drive/preview-modal";
import { useAudioPlayer } from "@/lib/audio-player";
import { UploadDropzone } from "@/components/drive/upload-dropzone";
import { UploadQueuePanel } from "@/components/drive/upload-queue-panel";
import { EmptyState } from "@/components/drive/empty-state";
import { Clock, Lock, Star, Tag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { VaultGate } from "@/components/drive/vault-gate";
import { CordLinkPrompt } from "@/components/auth/cord-link-prompt";

import { useDiscordClient } from "@/lib/discord/context";
import { isDesktopApp } from "@/lib/use-platform";
import { useUploadQueue } from "@/lib/upload-queue";
import { useWebhookSync } from "@/components/auth/webhook-sync-provider";
import { useViewPrefs } from "@/lib/view-prefs";
import {
  ROOT_PARENT,
  setFavorite,
  setLocked,
  hardDeleteFile,
  hardDeleteFolderSubtree,
  getFolderSubtreeFiles,
  trashFile,
  trashFolder,
  bulkTrash,
  moveFile,
  moveFolder,
  getFile,
  getFolder,
  useActiveDrive,
  useActiveDriveId,
  useAllDrives,
  useDriveItems,
  useDriveIndex,
  restoreFile,
  restoreFolder,
  useFavorites,
  useVaultItems,
  useTrashedItems,
  useFilesByTag,
  type DriveItem,
  type ParentId,
} from "@/lib/storage";

type Section = DriveSection;

export default function DrivePage() {
  // useSearchParams (tab-bar deep-links) requires a Suspense boundary.
  return (
    <React.Suspense fallback={null}>
      <DriveContent />
    </React.Suspense>
  );
}

function DriveContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [activeDriveId, selectDrive] = useActiveDriveId();
  const activeDrive = useActiveDrive();
  const allDrives = useAllDrives();
  const { synced } = useWebhookSync();
  const client = useDiscordClient();
  const enqueue = useUploadQueue((s) => s.enqueue);

  const [section, setSection] = React.useState<Section>("files");
  // Bottom tab bar deep-links: /drive?section=vault → open the vault section,
  // and back to /drive (no param) → files. Only reacts when `section` itself
  // changes, so other params (?open=…) don't reset Favoris/Corbeille.
  const lastSectionParam = React.useRef<string | null>(null);
  React.useEffect(() => {
    const sec = searchParams.get("section");
    if (sec === lastSectionParam.current) return;
    lastSectionParam.current = sec;
    setSection(sec === "vault" ? "vault" : "files");
  }, [searchParams]);
  // Sans lien précis, la première ouverture suit le choix de l'utilisateur (Réglages › Apparence).
  const startedRef = React.useRef(false);
  React.useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    if (!searchParams.get("section") && useAppearance.getState().appearance.startPage === "home") setSection("home");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // A tab tap on the URL already shown changes nothing in the router (e.g.
  // « Fichiers » while in Favoris via the drive menu): the native bridge
  // announces every tap so the section still follows the tab.
  React.useEffect(() => {
    const onTab = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path !== "string" || !path.startsWith("/drive")) return;
      setSection(new URL(path, window.location.origin).searchParams.get("section") === "vault" ? "vault" : "files");
    };
    window.addEventListener("drivecord:tab", onTab);
    return () => window.removeEventListener("drivecord:tab", onTab);
  }, []);
  const [currentFolderId, setCurrentFolderId] =
    React.useState<ParentId>(ROOT_PARENT);
  const [search, setSearch] = React.useState("");

  // ── Navigation history ──────────────────────────────────────────────────────
  const [nav, setNav] = React.useState<{ history: ParentId[]; idx: number }>({
    history: [ROOT_PARENT],
    idx: 0,
  });

  const canGoBack = nav.idx > 0;
  const canGoForward = nav.idx < nav.history.length - 1;

  const navigateTo = React.useCallback((folderId: ParentId) => {
    setCurrentFolderId(folderId);
    setNav((prev) => ({
      history: [...prev.history.slice(0, prev.idx + 1), folderId],
      idx: prev.idx + 1,
    }));
  }, []);

  const goBack = React.useCallback(() => {
    setNav((prev) => {
      if (prev.idx === 0) return prev;
      const newIdx = prev.idx - 1;
      setCurrentFolderId(prev.history[newIdx]);
      return { ...prev, idx: newIdx };
    });
  }, []);

  const goForward = React.useCallback(() => {
    setNav((prev) => {
      if (prev.idx >= prev.history.length - 1) return prev;
      const newIdx = prev.idx + 1;
      setCurrentFolderId(prev.history[newIdx]);
      return { ...prev, idx: newIdx };
    });
  }, []);

  const resetHistory = React.useCallback((folderId: ParentId = ROOT_PARENT) => {
    setCurrentFolderId(folderId);
    setNav({ history: [folderId], idx: 0 });
  }, []);

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;
      if (inInput) return;
      if (e.altKey && e.key === "ArrowLeft") { e.preventDefault(); goBack(); }
      if (e.altKey && e.key === "ArrowRight") { e.preventDefault(); goForward(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [goBack, goForward]);

  const { viewMode, setViewMode, sortField, setSortField, sortDir, setSortDir, filterKind, setFilterKind } = useViewPrefs();

  const [activeTag, setActiveTag] = React.useState<string | null>(null);

  const [newFolderOpen, setNewFolderOpen] = React.useState(false);
  const [renameTarget, setRenameTarget] = React.useState<DriveItem | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<DriveItem | null>(null);
  const [moveTarget, setMoveTarget] = React.useState<DriveItem | null>(null);
  const [tagTarget, setTagTarget] = React.useState<DriveItem | null>(null);
  const [colorTarget, setColorTarget] = React.useState<DriveItem | null>(null);
  const [shareTarget, setShareTarget] = React.useState<DriveItem | null>(null);
  const [previewFileId, setPreviewFileId] = React.useState<string | null>(null);

  // Mini-lecteur → « retourner sur la page du lecteur » (demande en attente : fonctionne aussi
  // quand on arrive depuis une autre page).
  const audioOpenPending = useAudioPlayer((st) => st.pendingOpen);
  React.useEffect(() => {
    if (!audioOpenPending) return;
    const st = useAudioPlayer.getState();
    st.clearOpen();
    const t = st.track;
    if (t) {
      if (t.driveId && t.driveId !== activeDriveId) selectDrive(t.driveId);
      setPreviewFileId(t.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioOpenPending]);
  const [bulkDeleteItems, setBulkDeleteItems] = React.useState<DriveItem[]>([]);
  const [bulkMoveItems, setBulkMoveItems] = React.useState<DriveItem[]>([]);
  const [bulkTagItems, setBulkTagItems] = React.useState<DriveItem[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);
  const mediaInputRef = React.useRef<HTMLInputElement>(null);

  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  // Sélection remontée par l'explorateur : c'est elle qui décide de ce que montre la barre du bas.
  const [selection, setSelection] = React.useState<{ items: DriveItem[]; clear: () => void }>({ items: [], clear: () => {} });
  const handleSelectionChange = React.useCallback(
    (items: DriveItem[], clear: () => void) => setSelection((prev) => (prev.items.length === 0 && items.length === 0 ? prev : { items, clear })),
    [],
  );

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  // Les fenêtres (portails) du drive prennent le verre KitCord : la règle CSS dépend de cette classe.
  React.useEffect(() => {
    document.body.classList.add("drive-ui");
    return () => document.body.classList.remove("drive-ui");
  }, []);
  // Desktop tray "Ouvrir un drive" navigates here with ?open=<driveId>.
  React.useEffect(() => {
    if (!mounted || allDrives === undefined) return;
    const open = searchParams.get("open");
    if (open && allDrives.some((d) => d.id === open)) {
      if (open !== activeDriveId) selectDrive(open);
      router.replace("/drive");
    }
  }, [mounted, allDrives, searchParams, activeDriveId, selectDrive, router]);

  // Decide what a driveless page does — only once the sync for the current
  // account has settled. A stale activeDriveId (e.g. a drive from a previous
  // account that no longer exists) counts as "no selection", so switching
  // accounts never leaves the page blank.
  React.useEffect(() => {
    if (!mounted || !synced || allDrives === undefined) return;
    if (searchParams.get("open")) return; // handled by the effect above
    const validSelection =
      activeDriveId !== null && allDrives.some((d) => d.id === activeDriveId);
    if (validSelection) return;
    if (allDrives.length > 0) {
      selectDrive(allDrives[0].id); // auto-select the most recent drive
    } else {
      if (activeDriveId !== null) selectDrive(null); // clear stale selection
      router.replace("/setup");
    }
  }, [mounted, activeDriveId, synced, allDrives, selectDrive, router]);

  const driveId = activeDrive?.id ?? null;
  const [vaultUnlocked, setVaultUnlocked] = React.useState(false);

  const items      = useDriveItems(driveId, currentFolderId);
  const searching = search.trim() !== "";
  // While searching "Tous les fichiers", look in the whole drive, not just the open folder.
  const driveIndex = useDriveIndex(driveId, (searching && section === "files") || section === "recent" || section === "home");
  const favorites  = useFavorites(driveId);
  const trashed    = useTrashedItems(driveId);
  const taggedItems = useFilesByTag(driveId, activeTag);
  const vaultItems = useVaultItems(driveId, section === "vault" && vaultUnlocked);

  // Re-lock the vault (and forget the encryption key) when we leave its
  // section or switch drive.
  React.useEffect(() => {
    if (section !== "vault") { setVaultUnlocked(false); clearVaultKey(); }
  }, [section]);
  React.useEffect(() => { setVaultUnlocked(false); clearVaultKey(); }, [driveId]);

  // Récents : les derniers fichiers modifiés de tout le drive (hors corbeille et coffre).
  const recentItems = React.useMemo(() => {
    if (!driveIndex) return driveIndex;
    return driveIndex
      .filter((it) => it.kind === "file" && !it.trashed && !it.locked)
      .sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt))
      .slice(0, 120);
  }, [driveIndex]);

  const displayedItems = React.useMemo(() => {
    const base =
      section === "files" ? (searching ? driveIndex : items)
      : section === "recent" || section === "home" ? recentItems
      : section === "favorites" ? favorites
      : section === "vault" ? vaultItems
      : section === "tag" ? taggedItems
      : trashed;
    if (!base) return base;
    const q = search.trim().toLowerCase();
    if (!q) return base;
    return base.filter((it) => {
      const name = it.kind === "folder" ? it.name : it.filename;
      return name.toLowerCase().includes(q);
    });
  }, [section, items, searching, driveIndex, recentItems, favorites, vaultItems, trashed, taggedItems, search]);

  const previewSiblings = React.useMemo(
    () => (displayedItems ?? []).filter((i) => i.kind === "file").map((i) => i.id),
    [displayedItems],
  );

  // ---------- Actions ----------

  const handleUploadEntries = React.useCallback(
    async (entries: UploadEntry[], parentOverride?: ParentId) => {
      if (!activeDrive || !client) { toast.error("Drive non prêt"); return; }
      if (entries.length === 0) return;
      const driveId = activeDrive.id;
      const base = parentOverride ?? currentFolderId;
      // Big batches: the upload panel already shows progress — one toast per file just stacks up.
      const quiet = entries.length > 3;
      const onUploaded = quiet ? undefined : (item: { fileName: string }) =>
        toast.success(`« ${item.fileName} » uploadé`);

      // In the vault section, uploads must be encrypted — which needs the
      // PIN-derived key. If the vault was opened via Face ID only (no key),
      // ask for the PIN rather than silently uploading outside the vault.
      if (section === "vault" && vaultUnlocked && !getVaultKey()) {
        toast.error("Entre ton code PIN pour ajouter un fichier (chiffrement) au coffre.");
        return;
      }
      // Uploading inside the unlocked vault → encrypt + lock (flattened, no
      // folder structure to avoid leaking folder names outside the vault).
      const vaultKey = section === "vault" && vaultUnlocked ? getVaultKey() : null;
      if (vaultKey) {
        enqueue({
          files: entries.map((e) => e.file),
          driveId, parentId: base, client,
          encryptKey: vaultKey,
          locked: true,
          onUploaded: quiet ? undefined : (item) => toast.success(`« ${item.fileName} » chiffré 🔒`),
        });
        return;
      }

      // Non-vault uploads are encrypted with the drive's key (when signed in;
      // null otherwise → uploaded in clear, exactly as before).
      // End-to-end encrypt with the drive key. If it isn't available (storage locked, migration
      // failed) we refuse to upload rather than silently sending the file in clear.
      const driveKey = await ensureDriveKey(activeDrive).catch(() => null);
      if (!driveKey) { toast.error("Déverrouille ton stockage chiffré pour envoyer des fichiers."); return; }

      // Flat upload (no folders) — keep the simple path.
      const hasFolders = entries.some((e) => e.path !== "");
      if (!hasFolders) {
        enqueue({
          files: entries.map((e) => e.file),
          driveId, parentId: base, client,
          e2eeKey: driveKey,
          locked: false,
          onUploaded,
        });
        return;
      }

      // Recreate the folder tree, then upload each file into its folder.
      try {
        const paths = new Set(entries.map((e) => e.path));
        const folderMap = await ensureFolderTree(paths, base, ({ parentId, name }) =>
          createFolder({ driveId, parentId, name }),
        );
        // Group files by their target folder id.
        const groups = new Map<ParentId, File[]>();
        for (const e of entries) {
          const pid = folderMap.get(e.path) ?? base;
          (groups.get(pid) ?? groups.set(pid, []).get(pid)!).push(e.file);
        }
        for (const [pid, files] of groups) {
          enqueue({
            files, driveId, parentId: pid, client,
            e2eeKey: driveKey,
            locked: false,
            onUploaded,
          });
        }
        toast.success(`Dossier importé (${entries.length} fichier(s))`);
      } catch {
        toast.error("Échec de l'import du dossier");
      }
    },
    [activeDrive, client, currentFolderId, enqueue, section, vaultUnlocked],
  );

  const handleMoveTo = React.useCallback(
    async (sourceItemId: string, targetParentId: ParentId) => {
      if (!driveId) return;
      try {
        const fileRow = await getFile(driveId, sourceItemId);
        if (fileRow) {
          if (fileRow.parentId === targetParentId) return;
          await moveFile(driveId, sourceItemId, targetParentId);
          toast.success(`« ${fileRow.filename} » déplacé`);
          return;
        }
        const folderRow = await getFolder(driveId, sourceItemId);
        if (folderRow) {
          if (folderRow.parentId === targetParentId) return;
          await moveFolder(driveId, sourceItemId, targetParentId);
          toast.success(`« ${folderRow.name} » déplacé`);
          return;
        }
        toast.error("Élément introuvable");
      } catch (err) {
        toast.error(`Déplacement impossible : ${(err as Error).message}`);
      }
    },
    [driveId],
  );

  // Download one file: fetch → decrypt → save (native: gallery/Files · web: download).
  const downloadFileItem = React.useCallback(
    async (item: Extract<DriveItem, { kind: "file" }>) => {
      if (!client) { toast.error("Client Discord indisponible"); return; }
      await downloadFileWithToast(client, item); // streamed to disk, progress + cancel
    },
    [client],
  );

  const handleAction = React.useCallback(
    async (action: string, item: DriveItem) => {
      if (action === "open" && item.kind === "folder") { setCurrentFolderId(item.id); return; }
      if (action === "rename") { setRenameTarget(item); return; }
      if (action === "delete") { setDeleteTarget(item); return; }
      if (action === "move") { setMoveTarget(item); return; }
      if (action === "tag") { setTagTarget(item); return; }
      if (action === "color") { setColorTarget(item); return; }
      if (action === "share") { setShareTarget(item); return; }
      if (action === "encrypt" && item.kind === "file") {
        if (!client) { toast.error("Drive non prêt"); return; }
        toast.promise(convertFileToE2ee(client, item.driveId, item).then(() => refreshDrive(item.driveId)), {
          loading: `Chiffrement de « ${item.filename} »…`,
          success: "Fichier chiffré de bout en bout 🔒",
          error: (e) => `Chiffrement impossible : ${(e as Error).message}`,
        });
        return;
      }
      if (action === "favorite" && item.kind === "file") {
        try { await setFavorite(item.driveId, item.id, !item.favorite); }
        catch (err) { toast.error((err as Error).message); }
        return;
      }
      if (action === "restore") {
        try {
          if (item.kind === "folder") await restoreFolder(item.driveId, item.id);
          else await restoreFile(item.driveId, item.id);
          toast.success("Restauré");
        } catch (err) { toast.error(`Restauration impossible : ${(err as Error).message}`); }
        return;
      }
      if (action === "lock" && item.kind === "file") {
        try {
          await setLocked(item.driveId, item.id, !item.locked);
          toast.success(item.locked ? "Sorti du coffre-fort" : "Mis dans le coffre-fort 🔒");
        } catch (err) { toast.error((err as Error).message); }
        return;
      }
      if (action === "download" && item.kind === "file") {
        await downloadFileItem(item);
      }
      if (action === "download" && item.kind === "folder") {
        if (!activeDrive || !client) { toast.error("Drive non prêt"); return; }
        await downloadZipWithToast([item], activeDrive.id, client, item.name);
      }
    },
    [client, downloadFileItem, activeDrive],
  );

  const handleConfirmDelete = React.useCallback(
    async (item: DriveItem) => {
      if (!driveId) return;
      try {
        if (item.kind === "folder") {
          if (section === "trash") {
            const files = await getFolderSubtreeFiles(driveId, item.id);
            if (client) {
              for (const f of files) await client.deleteFile(f);
            }
            // Discord cleanup succeeded (or there was no client to attempt
            // it with) — only now is it safe to drop the metadata.
            const { deletedFiles } = await hardDeleteFolderSubtree(driveId, item.id);
            toast.success(`Dossier supprimé définitivement (${deletedFiles.length} fichier${deletedFiles.length > 1 ? "s" : ""})`);
          } else {
            await trashFolder(driveId, item.id);
            toast.success("Dossier déplacé vers la corbeille");
          }
        } else {
          if (section === "trash") {
            if (client) await client.deleteFile(item);
            await hardDeleteFile(driveId, item.id);
            toast.success("Fichier supprimé définitivement");
          } else {
            await trashFile(driveId, item.id);
            toast.success("Déplacé vers la corbeille");
          }
        }
      } catch (err) { toast.error(`Échec : ${(err as Error).message}`); }
    },
    [driveId, section, client],
  );

  const handleBulkAction = React.useCallback(
    (action: BulkAction, items: DriveItem[]) => {
      if (items.length === 0) return;
      if (action === "delete") setBulkDeleteItems(items);
      else if (action === "move") setBulkMoveItems(items);
      else if (action === "tag") setBulkTagItems(items);
      else if (action === "download") {
        if (!activeDrive || !client) { toast.error("Drive non prêt"); return; }
        // A single file → download it directly (no ZIP). Otherwise → ZIP.
        if (items.length === 1 && items[0].kind === "file") {
          downloadFileItem(items[0] as Extract<DriveItem, { kind: "file" }>);
          return;
        }
        const onlyFolder = items.length === 1 && items[0].kind === "folder";
        const zipName = onlyFolder
          ? (items[0] as { name: string }).name
          : `${activeDrive.name}-${new Date().toISOString().slice(0, 10)}`;
        void downloadZipWithToast(items, activeDrive.id, client, zipName);
      }
    },
    [activeDrive, client, downloadFileItem],
  );

  const handleBulkConfirmDelete = React.useCallback(
    async (items: DriveItem[]) => {
      if (!driveId) return;
      const isPermanent = section === "trash";

      // Fast path — move to trash: a single bulk request (one DB updateMany +
      // one cache refresh) instead of N sequential PATCHes.
      if (!isPermanent) {
        const fileIds = items.filter((i) => i.kind !== "folder").map((i) => i.id);
        const folderIds = items.filter((i) => i.kind === "folder").map((i) => i.id);
        try {
          await bulkTrash(driveId, "trash", fileIds, folderIds);
          const n = items.length;
          toast.success(`${n} élément${n > 1 ? "s" : ""} mis à la corbeille`);
        } catch (err) {
          toast.error(`Échec : ${(err as Error).message}`);
        }
        setBulkDeleteItems([]);
        return;
      }

      // Permanent delete needs Discord chunk deletions — run several at a time
      // (bounded concurrency) instead of strictly one-by-one.
      let ok = 0;
      const tasks = items.map((item) => async () => {
        try {
          if (item.kind === "folder") {
            const files = await getFolderSubtreeFiles(driveId, item.id);
            if (client) await Promise.all(files.map((f) => client.deleteFile(f)));
            // Only drop metadata once Discord cleanup is confirmed clean.
            await hardDeleteFolderSubtree(driveId, item.id);
          } else {
            if (client) await client.deleteFile(item);
            await hardDeleteFile(driveId, item.id);
          }
          ok++;
        } catch (err) { toast.error(`Échec : ${(err as Error).message}`); }
      });
      const POOL = 6;
      let cursor = 0;
      await Promise.all(
        Array.from({ length: Math.min(POOL, tasks.length) }, async () => {
          while (cursor < tasks.length) { const idx = cursor++; await tasks[idx](); }
        }),
      );
      if (ok > 0) {
        toast.success(`${ok} élément${ok > 1 ? "s" : ""} supprimé${ok > 1 ? "s" : ""} définitivement`);
      }
      setBulkDeleteItems([]);
    },
    [driveId, section, client],
  );

  // ---------- Render ----------

  if (!mounted || (activeDriveId !== null && !activeDrive)) return null;
  if (!activeDrive) return null;

  const hideControls =
    (section === "vault" && !vaultUnlocked) ||
    (section !== "files" && (displayedItems?.length ?? 0) === 0);
  // Que propose la barre du bas quand rien n'est sélectionné : envoyer, seulement là où c'est possible.
  const canUpload = ((section === "files" || section === "home") && !searching) || (section === "vault" && vaultUnlocked);

  return (
    <div className="isolate relative min-h-[100dvh]">
      <DriveBackdrop />
      {/* Tiroir de navigation (mobile) : sur bureau, tout est dans la barre du haut. */}
      <DriveSidebar
        section={section}
        onSectionChange={setSection}
        onNavigateRoot={() => { resetHistory(ROOT_PARENT); setSection("files"); }}
        activeTag={activeTag}
        onTagSelect={(tag) => { setActiveTag(tag); setSection("tag"); resetHistory(ROOT_PARENT); }}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <UploadDropzone onEntries={(entries) => handleUploadEntries(entries)} className="relative z-10 flex min-h-[100dvh] min-w-0 flex-col">
        <DriveNav
          section={section}
          onSectionChange={setSection}
          onNavigateRoot={() => { resetHistory(ROOT_PARENT); setSection("files"); }}
          activeTag={activeTag}
          onTagSelect={(tag) => { setActiveTag(tag); setSection("tag"); resetHistory(ROOT_PARENT); }}
          onHome={() => { resetHistory(ROOT_PARENT); setSection("home"); }}
          onMenuOpen={() => setSidebarOpen(true)}
          nativeMenu={
            <DriveNativeMenu
              section={section}
              onSectionChange={setSection}
              onNavigateRoot={() => { resetHistory(ROOT_PARENT); setSection("files"); }}
              activeTag={activeTag}
              onTagSelect={(tag) => { setActiveTag(tag); setSection("tag"); resetHistory(ROOT_PARENT); }}
            />
          }
        />

        <main className="drive-wrap drive-pad flex flex-1 flex-col">
          {section === "home" && (
            <DriveHome
              recents={recentItems}
              onUpload={() => fileInputRef.current?.click()}
              onNewFolder={() => setNewFolderOpen(true)}
              onBackup={() => router.push(isDesktopApp() ? "/desktop-sync" : "/backup")}
              backupLabel={isDesktopApp() ? "Synchroniser un dossier" : "Sauvegarder ma pellicule"}
              onAction={handleAction}
              onPreviewFile={(id) => setPreviewFileId(id)}
              onSeeAll={() => setSection("recent")}
            />
          )}
          {section !== "home" && !(section === "vault" && !vaultUnlocked) && <DrivePageHead
            section={section}
            activeTag={activeTag}
            driveId={driveId}
            currentFolderId={currentFolderId}
            onNavigate={navigateTo}
            onDropItemOnBreadcrumb={handleMoveTo}
            canGoBack={canGoBack}
            canGoForward={canGoForward}
            onGoBack={goBack}
            onGoForward={goForward}
            count={section === "vault" && !vaultUnlocked ? undefined : displayedItems?.length}
            search={search}
            onClearSearch={() => setSearch("")}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            sortField={section === "recent" ? "date" : sortField}
            sortDir={section === "recent" ? "desc" : sortDir}
            onSortChange={(field, dir) => { setSortField(field); setSortDir(dir); }}
            filterKind={filterKind}
            onFilterChange={setFilterKind}
            hideControls={hideControls}
          />}
          <CordLinkPrompt />
          {section === "vault" && !vaultUnlocked && (
            <VaultGate onUnlock={() => setVaultUnlocked(true)} />
          )}
          {section === "recent" && (displayedItems?.length ?? 0) === 0 && (
            <EmptyState icon={Clock} title="Rien de récent" description="Les derniers fichiers que tu envoies ou modifies apparaissent ici." />
          )}
          {section === "favorites" && (displayedItems?.length ?? 0) === 0 && (
            <EmptyState icon={Star} title="Aucun favori" description="Mets un fichier en favori avec le menu contextuel pour le retrouver ici." />
          )}
          {section === "vault" && vaultUnlocked && (displayedItems?.length ?? 0) === 0 && (
            <EmptyState icon={Lock} title="Coffre-fort vide" description="Mets un fichier dans le coffre via le menu contextuel (« Mettre dans le coffre-fort »)." />
          )}
          {section === "trash" && (displayedItems?.length ?? 0) === 0 && (
            <EmptyState icon={Trash2} title="Corbeille vide" description="Les fichiers et dossiers supprimés apparaissent ici." />
          )}
          {section === "tag" && (displayedItems?.length ?? 0) === 0 && (
            <EmptyState icon={Tag} title={`Aucun fichier avec #${activeTag}`} description="Ajoute ce tag à des fichiers via le menu contextuel." />
          )}
          {section === "trash" && (trashed?.length ?? 0) > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3 text-sm text-muted-foreground">
              <span>{trashed!.length} élément{trashed!.length > 1 ? "s" : ""} dans la corbeille</span>
              <Button variant="outline" size="sm" className="text-red-400 hover:text-red-300" onClick={() => setBulkDeleteItems(trashed!)}>
                <Trash2 className="size-4" />
                Vider la corbeille
              </Button>
            </div>
          )}
          {(section === "files" || (section === "vault" && vaultUnlocked && (displayedItems?.length ?? 0) > 0) || ((section === "favorites" || section === "trash" || section === "tag" || section === "recent") && (displayedItems?.length ?? 0) > 0)) && (
            <DriveExplorer
              key={`${section}-${currentFolderId}-${searching}`}
              items={displayedItems}
              viewMode={viewMode}
              sortField={section === "recent" ? "date" : sortField}
              sortDir={section === "recent" ? "desc" : sortDir}
              filterKind={filterKind}
              onSortChange={(field, dir) => { setSortField(field); setSortDir(dir); }}
              onAction={handleAction}
              onOpenFolder={(id) => { setSearch(""); navigateTo(id); }}
              onPreviewFile={(id) => setPreviewFileId(id)}
              onDropItem={(sourceId, targetFolder) => {
                if (targetFolder.kind !== "folder") return;
                handleMoveTo(sourceId, targetFolder.id);
              }}
              onDropExternalFiles={(files, targetFolder) => {
                if (targetFolder.kind !== "folder") return;
                handleUploadEntries(entriesFromFiles(files), targetFolder.id);
              }}
              onBulkAction={handleBulkAction}
              onSelectionChange={handleSelectionChange}
              onEmptyUpload={section === "files" && !searching ? () => fileInputRef.current?.click() : undefined}
            />
          )}
        </main>
      </UploadDropzone>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) handleUploadEntries(entriesFromFiles(files));
          e.target.value = "";
        }}
      />

      {/* Photos et vidéos : le sélecteur de la galerie (menu « Nouveau » du téléphone) */}
      <input
        ref={mediaInputRef}
        type="file"
        multiple
        accept="image/*,video/*"
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) handleUploadEntries(entriesFromFiles(files));
          e.target.value = "";
        }}
      />

      {/* Folder picker (webkitdirectory) — recreates the folder tree on upload */}
      <input
        ref={folderInputRef}
        type="file"
        multiple
        // @ts-expect-error non-standard but supported by all target browsers
        webkitdirectory=""
        directory=""
        className="hidden"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          if (files.length) handleUploadEntries(entriesFromFiles(files));
          e.target.value = "";
        }}
      />

      <CommandPalette
        onUpload={() => fileInputRef.current?.click()}
        onNewFolder={() => setNewFolderOpen(true)}
        onSection={(s) => {
          if (s === "files") { resetHistory(ROOT_PARENT); }
          setSection(s);
        }}
        onSearch={setSearch}
      />

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        driveId={activeDrive.id}
        parentId={currentFolderId}
      />
      <RenameDialog item={renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)} />
      <ConfirmDeleteDialog permanent={section === "trash"} item={deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} onConfirm={handleConfirmDelete} />
      <MoveDialog
        item={moveTarget}
        items={bulkMoveItems.length > 0 ? bulkMoveItems : undefined}
        driveId={activeDrive.id}
        onOpenChange={(open) => { if (!open) { setMoveTarget(null); setBulkMoveItems([]); } }}
      />
      <TagDialog item={tagTarget} onOpenChange={(open) => !open && setTagTarget(null)} />
      <ColorPickerDialog item={colorTarget} onOpenChange={(open) => !open && setColorTarget(null)} />
      <ShareDialog item={shareTarget} onOpenChange={(open) => !open && setShareTarget(null)} />
      <BulkDeleteDialog
        items={bulkDeleteItems}
        permanent={section === "trash"}
        onOpenChange={(open) => !open && setBulkDeleteItems([])}
        onConfirm={handleBulkConfirmDelete}
      />
      <BulkTagDialog
        items={bulkTagItems}
        driveId={activeDrive.id ?? null}
        onOpenChange={(open) => !open && setBulkTagItems([])}
      />
      <PreviewModal
        driveId={driveId}
        fileId={previewFileId}
        siblings={previewSiblings}
        onClose={() => setPreviewFileId(null)}
        onNavigate={setPreviewFileId}
        onAction={(action, f) => { void handleAction(action, { ...f, kind: "file" } as DriveItem); }}
      />
      <DriveDock
        selection={selection.items}
        onClearSelection={selection.clear}
        onBulkAction={handleBulkAction}
        onItemAction={handleAction}
        onUpload={canUpload ? () => fileInputRef.current?.click() : undefined}
        onFolderUpload={section === "files" && !searching ? () => folderInputRef.current?.click() : undefined}
        onNewFolder={(section === "files" || section === "home") && !searching ? () => setNewFolderOpen(true) : undefined}
        inTrash={section === "trash"}
        tabs={{
          section,
          onSection: (s) => { if (s === "files") resetHistory(ROOT_PARENT); setSection(s); },
          onShares: () => router.push("/shares"),
          onUploadMedia: () => mediaInputRef.current?.click(),
          onBackup: () => router.push(isDesktopApp() ? "/desktop-sync" : "/backup"),
        }}
      />
      <UploadQueuePanel />

    </div>
  );
}
