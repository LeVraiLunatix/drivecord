"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { DriveSidebar } from "@/components/drive/sidebar";
import { DriveTopbar } from "@/components/drive/topbar";
import { CommandPalette } from "@/components/drive/command-palette";
import { entriesFromFiles, ensureFolderTree, type UploadEntry } from "@/lib/upload-folder";
import { createFolder } from "@/lib/storage";
import { downloadItemsAsZip } from "@/lib/download-zip";
import { maybeDecrypt } from "@/lib/crypto/vault-decrypt";
import { getVaultKey, clearVaultKey } from "@/lib/crypto/vault-key-store";
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
import { UploadDropzone } from "@/components/drive/upload-dropzone";
import { UploadQueuePanel } from "@/components/drive/upload-queue-panel";
import { EmptyState } from "@/components/drive/empty-state";
import FloatingActionMenu from "@/components/ui/floating-action-menu";
import { FolderPlus, FolderUp, Lock, Star, Tag, Trash2, Upload } from "lucide-react";
import { VaultGate } from "@/components/drive/vault-gate";

import { useDiscordClient } from "@/lib/discord/context";
import { useUploadQueue } from "@/lib/upload-queue";
import { useViewPrefs } from "@/lib/view-prefs";
import {
  ROOT_PARENT,
  setFavorite,
  setLocked,
  hardDeleteFile,
  hardDeleteFolderSubtree,
  trashFile,
  trashFolder,
  moveFile,
  moveFolder,
  getFile,
  getFolder,
  useActiveDrive,
  useActiveDriveId,
  useDriveItems,
  useFavorites,
  useVaultItems,
  useTrashedItems,
  useFilesByTag,
  type DriveItem,
  type ParentId,
} from "@/lib/storage";

type Section = "files" | "favorites" | "vault" | "trash" | "tag";

export default function DrivePage() {
  const router = useRouter();
  const [activeDriveId] = useActiveDriveId();
  const activeDrive = useActiveDrive();
  const client = useDiscordClient();
  const enqueue = useUploadQueue((s) => s.enqueue);

  const [section, setSection] = React.useState<Section>("files");
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
  const [previewFileId, setPreviewFileId] = React.useState<string | null>(null);
  const [bulkDeleteItems, setBulkDeleteItems] = React.useState<DriveItem[]>([]);
  const [bulkMoveItems, setBulkMoveItems] = React.useState<DriveItem[]>([]);
  const [bulkTagItems, setBulkTagItems] = React.useState<DriveItem[]>([]);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const folderInputRef = React.useRef<HTMLInputElement>(null);

  const [sidebarOpen, setSidebarOpen] = React.useState(false);

  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (mounted && activeDriveId === null) router.replace("/setup");
  }, [mounted, activeDriveId, router]);

  const driveId = activeDrive?.id ?? null;
  const [vaultUnlocked, setVaultUnlocked] = React.useState(false);
  const items      = useDriveItems(driveId, currentFolderId);
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

  const displayedItems = React.useMemo(() => {
    const base =
      section === "files" ? items
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
  }, [section, items, favorites, vaultItems, trashed, taggedItems, search]);

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
      const onUploaded = (item: { fileName: string }) =>
        toast.success(`« ${item.fileName} » uploadé`);

      // Uploading inside the unlocked vault → encrypt + lock (flattened, no
      // folder structure to avoid leaking folder names outside the vault).
      const vaultKey = section === "vault" && vaultUnlocked ? getVaultKey() : null;
      if (vaultKey) {
        enqueue({
          files: entries.map((e) => e.file),
          driveId, parentId: base, client,
          encryptKey: vaultKey,
          onUploaded: (item) => toast.success(`« ${item.fileName} » chiffré 🔒`),
        });
        return;
      }

      // Flat upload (no folders) — keep the simple path.
      const hasFolders = entries.some((e) => e.path !== "");
      if (!hasFolders) {
        enqueue({ files: entries.map((e) => e.file), driveId, parentId: base, client, onUploaded });
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
          enqueue({ files, driveId, parentId: pid, client, onUploaded });
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

  const handleAction = React.useCallback(
    async (action: string, item: DriveItem) => {
      if (action === "open" && item.kind === "folder") { setCurrentFolderId(item.id); return; }
      if (action === "rename") { setRenameTarget(item); return; }
      if (action === "delete") { setDeleteTarget(item); return; }
      if (action === "move") { setMoveTarget(item); return; }
      if (action === "tag") { setTagTarget(item); return; }
      if (action === "color") { setColorTarget(item); return; }
      if (action === "favorite" && item.kind === "file") {
        try { await setFavorite(item.driveId, item.id, !item.favorite); }
        catch (err) { toast.error((err as Error).message); }
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
        if (!client) { toast.error("Client Discord indisponible"); return; }
        toast.info(`Téléchargement de « ${item.filename} »…`);
        try {
          const raw = await client.downloadFile({
            size: item.size, mimeType: item.mimeType,
            filename: item.filename, chunkSize: item.chunkSize, chunks: item.chunks,
          });
          const blob = await maybeDecrypt(raw, item);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = item.filename; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 60_000);
          toast.success(`« ${item.filename} » téléchargé`);
        } catch (err) { toast.error(`Échec : ${(err as Error).message}`); }
      }
    },
    [client],
  );

  const handleConfirmDelete = React.useCallback(
    async (item: DriveItem) => {
      if (!driveId) return;
      try {
        if (item.kind === "folder") {
          if (section === "trash") {
            const { deletedFiles } = await hardDeleteFolderSubtree(driveId, item.id);
            if (client) {
              for (const f of deletedFiles) {
                await client.deleteFile(f).catch((err) =>
                  toast.warning(`Métadonnées supprimées, Discord : ${(err as Error).message}`),
                );
              }
            }
            toast.success(`Dossier supprimé définitivement (${deletedFiles.length} fichier${deletedFiles.length > 1 ? "s" : ""})`);
          } else {
            await trashFolder(driveId, item.id);
            toast.success("Dossier déplacé vers la corbeille");
          }
        } else {
          if (section === "trash") {
            if (client) {
              await client.deleteFile(item).catch((err) =>
                toast.warning(`Métadonnées supprimées, Discord : ${(err as Error).message}`),
              );
            }
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
        const onlyFolder = items.length === 1 && items[0].kind === "folder";
        const zipName = onlyFolder
          ? (items[0] as { name: string }).name
          : `${activeDrive.name}-${new Date().toISOString().slice(0, 10)}`;
        let done = 0;
        toast.promise(
          downloadItemsAsZip(items, activeDrive.id, client, zipName, () => { done += 1; }),
          {
            loading: "Préparation du ZIP… (téléchargement des fichiers)",
            success: () => `ZIP téléchargé (${done} fichier${done > 1 ? "s" : ""})`,
            error: "Échec de la création du ZIP",
          },
        );
      }
    },
    [activeDrive, client],
  );

  const handleBulkConfirmDelete = React.useCallback(
    async (items: DriveItem[]) => {
      if (!driveId) return;
      const isPermanent = section === "trash";
      let ok = 0;
      for (const item of items) {
        try {
          if (item.kind === "folder") {
            if (isPermanent) {
              const { deletedFiles } = await hardDeleteFolderSubtree(driveId, item.id);
              if (client) {
                for (const f of deletedFiles) {
                  await client.deleteFile(f).catch(() => {});
                }
              }
            } else {
              await trashFolder(driveId, item.id);
            }
          } else {
            if (isPermanent) {
              if (client) await client.deleteFile(item).catch(() => {});
              await hardDeleteFile(driveId, item.id);
            } else {
              await trashFile(driveId, item.id);
            }
          }
          ok++;
        } catch (err) { toast.error(`Échec : ${(err as Error).message}`); }
      }
      if (ok > 0) {
        toast.success(
          isPermanent
            ? `${ok} élément${ok > 1 ? "s" : ""} supprimé${ok > 1 ? "s" : ""} définitivement`
            : `${ok} élément${ok > 1 ? "s" : ""} mis à la corbeille`,
        );
      }
      setBulkDeleteItems([]);
    },
    [driveId, section, client],
  );

  // ---------- Render ----------

  if (!mounted || (activeDriveId !== null && !activeDrive)) return null;
  if (!activeDrive) return null;

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      <DriveSidebar
        section={section}
        onSectionChange={setSection}
        onNavigateRoot={() => { resetHistory(ROOT_PARENT); setSection("files"); }}
        activeTag={activeTag}
        onTagSelect={(tag) => { setActiveTag(tag); setSection("tag"); resetHistory(ROOT_PARENT); }}
        mobileOpen={sidebarOpen}
        onMobileClose={() => setSidebarOpen(false)}
      />

      <UploadDropzone onEntries={(entries) => handleUploadEntries(entries)} className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <DriveTopbar
          onMenuOpen={() => setSidebarOpen(true)}
          driveId={driveId}
          currentFolderId={currentFolderId}
          onNavigate={navigateTo}
          canGoBack={canGoBack}
          canGoForward={canGoForward}
          onGoBack={goBack}
          onGoForward={goForward}
          onNewFolder={() => setNewFolderOpen(true)}
          onUploadClick={() => fileInputRef.current?.click()}
          onFolderUploadClick={() => folderInputRef.current?.click()}
          search={search}
          onSearchChange={setSearch}
          searchVisible={section !== "trash"}
          onDropItemOnBreadcrumb={handleMoveTo}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          sortField={sortField}
          sortDir={sortDir}
          onSortChange={(field, dir) => { setSortField(field); setSortDir(dir); }}
          filterKind={filterKind}
          onFilterChange={setFilterKind}
        />

        <main className="flex flex-1 flex-col overflow-y-auto px-3 py-3 sm:px-6 sm:py-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          {section === "vault" && !vaultUnlocked && (
            <VaultGate onUnlock={() => setVaultUnlocked(true)} />
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
          {(section === "files" || (section === "vault" && vaultUnlocked && (displayedItems?.length ?? 0) > 0) || ((section === "favorites" || section === "trash" || section === "tag") && (displayedItems?.length ?? 0) > 0)) && (
            <DriveExplorer
              key={`${section}-${currentFolderId}`}
              items={displayedItems}
              viewMode={viewMode}
              sortField={sortField}
              sortDir={sortDir}
              filterKind={filterKind}
              onSortChange={(field, dir) => { setSortField(field); setSortDir(dir); }}
              onAction={handleAction}
              onOpenFolder={navigateTo}
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
      />

      <NewFolderDialog
        open={newFolderOpen}
        onOpenChange={setNewFolderOpen}
        driveId={activeDrive.id}
        parentId={currentFolderId}
      />
      <RenameDialog item={renameTarget} onOpenChange={(open) => !open && setRenameTarget(null)} />
      <ConfirmDeleteDialog item={deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)} onConfirm={handleConfirmDelete} />
      <MoveDialog
        item={moveTarget}
        items={bulkMoveItems.length > 0 ? bulkMoveItems : undefined}
        driveId={activeDrive.id}
        onOpenChange={(open) => { if (!open) { setMoveTarget(null); setBulkMoveItems([]); } }}
      />
      <TagDialog item={tagTarget} onOpenChange={(open) => !open && setTagTarget(null)} />
      <ColorPickerDialog item={colorTarget} onOpenChange={(open) => !open && setColorTarget(null)} />
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
      />
      <UploadQueuePanel />

      {/* Mobile-only floating quick actions (desktop uses the topbar buttons) */}
      <FloatingActionMenu
        className="lg:hidden right-4 z-40 bottom-[calc(1.5rem+env(safe-area-inset-bottom))]"
        options={[
          {
            label: "Upload fichiers",
            Icon: <Upload className="size-4" />,
            onClick: () => fileInputRef.current?.click(),
          },
          {
            label: "Importer un dossier",
            Icon: <FolderUp className="size-4" />,
            onClick: () => folderInputRef.current?.click(),
          },
          {
            label: "Nouveau dossier",
            Icon: <FolderPlus className="size-4" />,
            onClick: () => setNewFolderOpen(true),
          },
        ]}
      />
    </div>
  );
}
