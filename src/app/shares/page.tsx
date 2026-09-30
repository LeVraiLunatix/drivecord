"use client";

import * as React from "react";
import useSWR from "swr";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { toast } from "sonner";
import {
  Link2,
  Copy,
  Check,
  Trash2,
  ExternalLink,
  Download,
  Lock,
  CalendarClock,
  Loader2,
  FileWarning,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BackButton } from "@/components/back-button";
import { formatBytes } from "@/lib/utils/format";
import { authFetch, apiFetcher as fetcher } from "@/lib/api-base";
import { b64urlEncode } from "@/lib/crypto/e2ee";
import { getDriveKeyMaterialById } from "@/lib/e2ee-client/drive-keys";
import { getFileCipher, readFileMeta } from "@/lib/e2ee-client/file-crypto";
import { useKeyring } from "@/components/e2ee/use-keyring";

type Share = {
  token: string;
  driveName: string | null;
  filename: string;
  size: number;
  missing: boolean;
  hasPassword: boolean;
  expiresAt: number | null;
  expired: boolean;
  downloads: number;
  createdAt: number;
  driveId: string | null;
  fileId: string;
  disabled?: boolean;
  cryptoVersion?: number;
  fkWrapped?: string | null;
  noncePrefix?: string | null;
  encMeta?: string | null;
  needsRegenerate?: boolean;
};

/** Decrypted name and `#k=` fragment of an end-to-end encrypted share (empty while locked). */
type E2eeView = { name?: string; fragment?: string };


/** "N'expire jamais" / "Expire dans X jour(s)" / "Expire bientôt". */
function expiryLabel(expiresAt: number | null): string {
  if (!expiresAt) return "N'expire jamais";
  const ms = expiresAt - Date.now();
  if (ms <= 0) return "Expiré";
  const days = Math.ceil(ms / 86_400_000);
  if (days <= 1) {
    const hours = Math.ceil(ms / 3_600_000);
    return hours <= 1 ? "Expire dans moins d'1h" : `Expire dans ${hours}h`;
  }
  return `Expire dans ${days} jours`;
}

const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05, delayChildren: 0.03 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16, filter: "blur(4px)" },
  show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};

export default function SharesPage() {
  const reduce = useReducedMotion();
  const v = reduce ? {} : undefined;
  const { data, isLoading, mutate } = useSWR<{ shares: Share[] }>(
    "/api/account/shares",
    fetcher,
    { revalidateOnFocus: false },
  );
  const [copied, setCopied] = React.useState<string | null>(null);
  const { status: keyStatus } = useKeyring();
  const [e2ee, setE2ee] = React.useState<Record<string, E2eeView>>({});

  const shares = data?.shares ?? [];

  // Names and keys of end-to-end encrypted files only exist in the browser: open them here.
  React.useEffect(() => {
    if (keyStatus !== "unlocked") return;
    let cancelled = false;
    (async () => {
      const out: Record<string, E2eeView> = {};
      for (const s of data?.shares ?? []) {
        if (!s.cryptoVersion || !s.driveId || !s.fkWrapped || !s.noncePrefix || !s.encMeta) continue;
        try {
          const dk = await getDriveKeyMaterialById(s.driveId);
          const file = { id: s.fileId, fkWrapped: s.fkWrapped, noncePrefix: s.noncePrefix, encMeta: s.encMeta, cryptoVersion: s.cryptoVersion };
          out[s.token] = { name: (await readFileMeta(dk, file)).name, fragment: b64urlEncode((await getFileCipher(dk, file)).raw) };
        } catch { /* leave as locked */ }
      }
      if (!cancelled) setE2ee(out);
    })();
    return () => { cancelled = true; };
  }, [data, keyStatus]);

  // A password share has no key in its URL: the password unwraps it.
  const linkFor = (s: Share) => {
    const frag = e2ee[s.token]?.fragment;
    return `${origin}/s/${s.token}${frag && !s.hasPassword ? `#k=${frag}` : ""}`;
  };
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const totalDownloads = shares.reduce((a, s) => a + s.downloads, 0);
  const activeCount = shares.filter((s) => !s.expired && !s.missing).length;

  const copy = async (token: string) => {
    try {
      const s = shares.find((x) => x.token === token);
      if (s?.cryptoVersion && !e2ee[token]?.fragment && !s.hasPassword) {
        toast.error("Déverrouille ton stockage pour copier ce lien chiffré.");
        return;
      }
      await navigator.clipboard.writeText(s ? linkFor(s) : `${origin}/s/${token}`);
      setCopied(token);
      setTimeout(() => setCopied(null), 1800);
    } catch { toast.error("Copie impossible"); }
  };

  const revoke = async (token: string) => {
    try {
      const res = await authFetch(`/api/account/shares/${token}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success("Lien révoqué");
      mutate();
    } catch { toast.error("Échec de la révocation"); }
  };

  return (
    <motion.div
      variants={v ?? container}
      initial="hidden"
      animate="show"
      className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col gap-6 tabbar-pad px-5 pb-20 sm:px-6"
      style={{ paddingTop: "max(1.5rem, calc(env(safe-area-inset-top) + 0.75rem))" }}
    >
      <motion.div variants={v ?? item}>
        <BackButton fallback="/drive" className="w-fit" />
      </motion.div>

      <motion.header variants={v ?? item} className="space-y-1">
        <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
          <Link2 className="size-7 text-primary" />
          Liens partagés
        </h1>
        <p className="text-sm text-muted-foreground">
          {shares.length} lien(s) · {activeCount} actif(s) · {totalDownloads} téléchargement(s)
        </p>
      </motion.header>

      {isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data && shares.length === 0 && (
        <motion.div variants={v ?? item} className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Link2 className="size-8" />
          <p className="text-sm">Aucun lien partagé. Partage un fichier via son menu (« Partager par lien »).</p>
        </motion.div>
      )}

      {shares.some((s) => s.needsRegenerate) && (
        <motion.div variants={v ?? item} className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
          <strong>{shares.filter((s) => s.needsRegenerate).length} lien(s) à régénérer.</strong>{" "}
          Le chiffrement de ces fichiers a été renforcé : leurs anciens liens ne fonctionnent plus. Ouvre le fichier dans ton drive, puis « Partager par lien » pour en créer un nouveau.
        </motion.div>
      )}

      <div className="space-y-3">
        {shares.map((s) => (
          <motion.div key={s.token} variants={v ?? item}>
            <Card className={s.expired || s.missing ? "opacity-60" : undefined}>
              <CardContent className="space-y-3 p-4">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate font-medium">
                      {s.missing && <FileWarning className="size-4 shrink-0 text-destructive" />}
                      {s.cryptoVersion ? (e2ee[s.token]?.name ?? "Fichier chiffré") : s.filename}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {s.driveName ? `${s.driveName} · ` : ""}{formatBytes(s.size)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    <Badge variant="secondary" className="gap-1">
                      <Download className="size-3" /> {s.downloads}
                    </Badge>
                    {s.hasPassword && <Badge variant="secondary" className="gap-1"><Lock className="size-3" /></Badge>}
                    {s.needsRegenerate && <Badge variant="outline" className="text-amber-500">À régénérer</Badge>}
                    {s.disabled && <Badge variant="outline" className="text-destructive">Désactivé</Badge>}
                    {s.expired ? (
                      <Badge variant="outline" className="text-destructive">Expiré</Badge>
                    ) : (
                      <Badge variant="outline" className="gap-1 font-normal text-muted-foreground">
                        <CalendarClock className="size-3" />
                        {expiryLabel(s.expiresAt)}
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 overflow-hidden rounded-md border border-border/60 bg-background/60 px-2 py-1.5">
                  <code className="block min-w-0 flex-1 truncate font-mono text-xs">{origin}/s/{s.token}{e2ee[s.token]?.fragment && !s.hasPassword ? "#k=…" : ""}</code>
                  <Button size="icon" variant="ghost" className="size-7 shrink-0" onClick={() => copy(s.token)} title="Copier">
                    {copied === s.token ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  </Button>
                  <Button asChild size="icon" variant="ghost" className="size-7 shrink-0" title="Ouvrir">
                    <a href={linkFor(s).replace(origin, "")} target="_blank" rel="noopener noreferrer"><ExternalLink className="size-3.5" /></a>
                  </Button>
                  <Button size="icon" variant="ghost" className="size-7 shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => revoke(s.token)} title="Révoquer">
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}
