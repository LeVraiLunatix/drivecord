"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const inputCls =
  "h-10 w-full rounded-lg border border-border/60 bg-card/70 px-3 text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/30";

export function SecureAccountForm({ token }: { token: string }) {
  const router = useRouter();
  const [pw, setPw] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw.length < 8) {
      setError("Au moins 8 caractères.");
      return;
    }
    if (pw !== confirm) {
      setError("Les deux mots de passe ne correspondent pas.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/auth/secure-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: pw }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success("Compte sécurisé. Reconnecte-toi avec ton nouveau mot de passe.");
        router.push("/login");
      } else {
        setError(data.error ?? "Impossible de sécuriser le compte.");
      }
    } catch {
      setError("Erreur réseau.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Nouveau mot de passe
        </label>
        <input
          type="password"
          autoComplete="new-password"
          placeholder="8 caractères minimum"
          value={pw}
          onChange={(e) => setPw(e.target.value)}
          disabled={busy}
          className={cn(inputCls)}
        />
      </div>
      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Confirme le mot de passe
        </label>
        <input
          type="password"
          autoComplete="new-password"
          placeholder="••••••••"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          disabled={busy}
          className={cn(inputCls)}
        />
      </div>

      {error && (
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy} className="w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        Réinitialiser et sécuriser
      </Button>
    </form>
  );
}
