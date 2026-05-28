"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  CloudUpload,
  ExternalLink,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { addDriveFromWebhook, useAllDrives } from "@/lib/storage";
import { pushWebhookToServer } from "@/lib/auth/sync";

export default function SetupPage() {
  const router = useRouter();
  const drives = useAllDrives();
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const drive = await addDriveFromWebhook(url);
      // Silently sync to server (non-blocking, non-fatal)
      pushWebhookToServer(drive).catch(() => {});
      toast.success("Drive prêt !");
      router.push("/drive");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-6 py-12">
      <Button asChild variant="ghost" size="sm" className="w-fit">
        <Link href="/">
          <ArrowLeft className="size-4" />
          Retour
        </Link>
      </Button>

      <div className="space-y-2">
        <div className="flex items-center gap-2 font-mono text-sm uppercase tracking-wider text-muted-foreground">
          <CloudUpload className="size-4" />
          Configuration
        </div>
        <h1 className="text-3xl font-bold tracking-tight">
          Connecte un webhook Discord
        </h1>
        <p className="text-muted-foreground">
          Drivecord utilise un webhook Discord comme « compte ». Crée-en un dans
          un salon dédié, colle l&apos;URL ci-dessous, et tu es prêt à uploader.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">URL du webhook</CardTitle>
          <CardDescription>
            Tes drives sont stockés <strong>localement</strong> dans ton
            navigateur. L&apos;URL n&apos;est jamais envoyée à un serveur tiers.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="webhook">Webhook</Label>
            <Input
              id="webhook"
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://discord.com/api/webhooks/..."
              spellCheck={false}
              autoComplete="off"
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
              }}
              autoFocus
            />
          </div>
          <Button onClick={submit} disabled={!url || busy} className="w-full">
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            Valider & ouvrir le drive
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Comment obtenir une URL de webhook ?
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <ol className="list-decimal space-y-2 pl-5">
            <li>
              Crée un serveur Discord privé (ou utilises-en un dont tu es
              admin).
            </li>
            <li>
              Crée un salon dédié, par exemple <code>#drivecord-storage</code>.
            </li>
            <li>
              <strong>Paramètres du salon → Intégrations → Webhooks → Nouveau
              webhook</strong>.
            </li>
            <li>
              Clique sur <strong>Copier l&apos;URL du webhook</strong> et
              colle-la ci-dessus.
            </li>
          </ol>
          <p>
            <a
              href="https://support.discord.com/hc/en-us/articles/228383668-Intro-to-Webhooks"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 underline-offset-4 hover:underline"
            >
              Guide officiel Discord <ExternalLink className="size-3" />
            </a>
          </p>
        </CardContent>
      </Card>

      {drives && drives.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Drives existants</CardTitle>
            <CardDescription>
              Tu peux passer de l&apos;un à l&apos;autre depuis la barre latérale
              une fois dans l&apos;app.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {drives.map((d) => (
              // role=button + tabIndex on a <div> instead of a real <button>
              // because we render a Button (which is itself a <button>) inside.
              // Nesting <button> in <button> is invalid HTML and breaks hydration.
              <div
                key={d.id}
                role="button"
                tabIndex={0}
                onClick={() => setUrl(d.webhookUrl)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setUrl(d.webhookUrl);
                  }
                }}
                className="flex w-full cursor-pointer items-center justify-between rounded-md border border-border/50 bg-card/40 px-3 py-2 text-left text-sm transition-colors hover:bg-card focus-visible:outline-2 focus-visible:outline-ring"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    Drive {d.id.slice(0, 8)}…
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => {
                    // Stop the outer onClick from firing twice when the user
                    // actually clicks the inner button.
                    e.stopPropagation();
                    setUrl(d.webhookUrl);
                  }}
                >
                  Réutiliser
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
