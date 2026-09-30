"use client";

import * as React from "react";
import { Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ApproverSession, listPendingTransfers, type TransferState } from "@/lib/e2ee-client/transfer";
import { useKeyring } from "./use-keyring";

/**
 * On an UNLOCKED device: surfaces "a new device wants access" requests, shows the 6-digit code
 * to compare with the other screen, and only seals the key once the user approves.
 */
export function IncomingTransfers() {
  const { status } = useKeyring();
  const [pending, setPending] = React.useState<TransferState[]>([]);
  const [active, setActive] = React.useState<{ session: ApproverSession; label: string; code: string | null } | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (status !== "unlocked" || active) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const list = await listPendingTransfers();
        if (!stopped) setPending(list);
      } catch {
        /* offline / not signed in: try again next tick */
      }
    };
    void tick();
    const t = setInterval(tick, 4000);
    return () => { stopped = true; clearInterval(t); };
  }, [status, active]);

  const review = async (r: TransferState) => {
    const session = new ApproverSession(r.id);
    setActive({ session, label: r.label, code: null });
    try {
      await session.challenge();
      const code = await session.awaitCode();
      setActive({ session, label: r.label, code });
    } catch (e) {
      toast.error((e as Error).message);
      setActive(null);
    }
  };

  const finish = async (approve: boolean) => {
    if (!active) return;
    setBusy(true);
    try {
      if (approve) { await active.session.approve(); toast.success("Appareil approuvé."); }
      else { await active.session.deny(); toast("Demande refusée."); }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
      setActive(null);
      setPending([]);
    }
  };

  if (status !== "unlocked") return null;
  if (!active && pending.length === 0) return null;

  return (
    <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-md rounded-xl border border-border bg-card p-4 shadow-lg" data-testid="incoming-transfer">
      {active ? (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-medium"><Smartphone className="size-4" /> Nouvel appareil : {active.label}</p>
          {active.code ? (
            <>
              <p className="text-sm text-muted-foreground">Ce code est-il <strong>identique</strong> à celui affiché sur le nouvel appareil ? Sinon, refuse.</p>
              <p className="text-center font-mono text-3xl tracking-[0.3em]" data-testid="approver-sas-code">{active.code}</p>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => finish(false)} disabled={busy}>Refuser</Button>
                <Button className="flex-1" onClick={() => finish(true)} disabled={busy} data-testid="approve-transfer">
                  {busy && <Loader2 className="size-4 animate-spin" />} Les codes sont identiques
                </Button>
              </div>
            </>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> En attente du nouvel appareil…</p>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {pending.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-3">
              <p className="text-sm">Un appareil demande l&apos;accès : <strong>{r.label}</strong></p>
              <Button size="sm" onClick={() => review(r)} data-testid="review-transfer">Examiner</Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
