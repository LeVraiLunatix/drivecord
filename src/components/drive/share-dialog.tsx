"use client";

import * as React from "react";
import { Copy, Check, Link2, Loader2, Trash2, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import type { DriveItem } from "@/lib/storage";

type ShareInfo = { token: string; hasPassword: boolean; expiresAt: number | null };

const EXPIRY_OPTIONS = [
  { label: "Jamais", days: 0 },
  { label: "1 jour", days: 1 },
  { label: "7 jours", days: 7 },
  { label: "30 jours", days: 30 },
];

export function ShareDialog({
  item,
  onOpenChange,
}: {
  item: DriveItem | null;
  onOpenChange: (open: boolean) => void;
}) {
  const open = item !== null;
  const [share, setShare] = React.useState<ShareInfo | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [expiryDays, setExpiryDays] = React.useState(0);

  const fileId = item?.kind === "file" ? item.id : null;
  const driveId = item?.driveId ?? null;

  React.useEffect(() => {
    if (!open || !fileId || !driveId) return;
    setShare(null); setPassword(""); setExpiryDays(0); setCopied(false);
    setLoading(true);
    fetch(`/api/drive/${driveId}/files/${fileId}/share`)
      .then((r) => r.json())
      .then((d) => setShare(d.share ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, fileId, driveId]);

  const shareUrl = share ? `${typeof window !== "undefined" ? window.location.origin : ""}/s/${share.token}` : "";

  const createOrUpdate = async () => {
    if (!fileId || !driveId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/drive/${driveId}/files/${fileId}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: password || undefined, expiresInDays: expiryDays || null }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "Échec");
      setShare({ token: d.token, hasPassword: d.hasPassword, expiresAt: d.expiresAt });
      toast.success("Lien de partage créé 🔗");
    } catch (e) { toast.error((e as Error).message); }
    finally { setBusy(false); }
  };

  const revoke = async () => {
    if (!fileId || !driveId) return;
    setBusy(true);
    try {
      await fetch(`/api/drive/${driveId}/files/${fileId}/share`, { method: "DELETE" });
      setShare(null); setPassword(""); setExpiryDays(0);
      toast.success("Lien révoqué");
    } catch { toast.error("Échec"); }
    finally { setBusy(false); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch { /* clipboard blocked */ }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="size-4" /> Partager par lien
          </DialogTitle>
          <DialogDescription className="truncate">
            {item?.kind === "file" ? item.filename : ""}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-6"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
        ) : share ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 overflow-hidden rounded-lg border border-border/60 bg-background/60 p-2">
              <code className="block min-w-0 flex-1 truncate font-mono text-xs">{shareUrl}</code>
              <Button
                size="icon"
                variant="secondary"
                className="size-8 shrink-0"
                onClick={copy}
                title={copied ? "Copié" : "Copier le lien"}
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {share.hasPassword ? "🔒 Protégé par mot de passe · " : ""}
              {share.expiresAt ? `Expire le ${new Date(share.expiresAt).toLocaleDateString("fr")}` : "N'expire pas"}
            </p>
            <div className="flex gap-2">
              <Button asChild variant="outline" size="sm" className="gap-1.5">
                <a href={shareUrl} target="_blank" rel="noopener noreferrer">
                  Ouvrir <ExternalLink className="size-3.5" />
                </a>
              </Button>
              <Button variant="outline" size="sm" className="gap-1.5 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={revoke} disabled={busy}>
                <Trash2 className="size-3.5" /> Révoquer
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="share-pw">Mot de passe (optionnel)</Label>
              <Input id="share-pw" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Laisser vide = public" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>Expiration</Label>
              <div className="grid grid-cols-4 gap-1.5">
                {EXPIRY_OPTIONS.map((o) => (
                  <button
                    key={o.days}
                    onClick={() => setExpiryDays(o.days)}
                    className={`rounded-md border px-2 py-1.5 text-xs transition-colors ${
                      expiryDays === o.days ? "border-primary bg-primary/10 text-foreground" : "border-border/60 text-muted-foreground hover:bg-accent/60"
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
            <Button className="w-full gap-2" onClick={createOrUpdate} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              Créer le lien
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
