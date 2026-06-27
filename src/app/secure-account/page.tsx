import Link from "next/link";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { verifySecureAccountToken } from "@/lib/auth/secure-account";
import { AuthBackground } from "@/components/auth/auth-background";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SecureAccountForm } from "@/components/auth/secure-account-form";

/**
 * Page « Sécuriser le compte », atteinte via le lien d'un email de connexion.
 * Valide le jeton côté serveur puis propose de réinitialiser le mot de passe.
 */
export default async function SecureAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;
  const valid = token ? await verifySecureAccountToken(token) : null;

  return (
    <div className="relative flex min-h-[100dvh] flex-col">
      <AuthBackground />
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-6 px-6 py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
            {valid ? (
              <ShieldCheck className="size-7 text-white" />
            ) : (
              <ShieldAlert className="size-7 text-white" />
            )}
          </div>
          <span className="font-mono text-xl font-semibold tracking-tight">
            drivecord
          </span>
        </div>

        <Card className="border-border/60 bg-card/70 backdrop-blur-xl">
          {valid ? (
            <>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Sécurise ton compte</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Choisis un nouveau mot de passe pour{" "}
                  <span className="font-medium text-foreground">{valid.email}</span>.
                  Tes appareils de confiance et les connexions en attente seront
                  déconnectés.
                </p>
                <SecureAccountForm token={token!} />
              </CardContent>
            </>
          ) : (
            <>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Lien expiré</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <p className="text-sm text-muted-foreground">
                  Ce lien de sécurisation est invalide ou a expiré (il ne reste
                  valable que 30 minutes). Reconnecte-toi pour recevoir un nouvel
                  email.
                </p>
                <Link
                  href="/login"
                  className="inline-flex h-9 w-full items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition hover:opacity-90"
                >
                  Aller à la connexion
                </Link>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
