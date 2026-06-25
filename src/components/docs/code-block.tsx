"use client";

import * as React from "react";
import { Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bloc de code multi-lignes avec bouton « copier ». Pas de coloration
 * syntaxique (volontairement léger) — fond neutre qui s'adapte au thème.
 */
export function CodeBlock({
  children,
  language,
  className,
}: {
  children: string;
  language?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* presse-papiers indisponible */
    }
  };

  return (
    <div
      className={cn(
        "group relative my-5 overflow-hidden rounded-xl border border-border/60 bg-muted/50",
        className
      )}
    >
      {language && (
        <div className="flex items-center justify-between border-b border-border/50 px-4 py-1.5 font-mono text-xs text-muted-foreground">
          {language}
        </div>
      )}
      <pre className="overflow-x-auto p-4 text-sm leading-relaxed">
        <code className="font-mono text-foreground">{children}</code>
      </pre>
      <button
        type="button"
        onClick={copy}
        aria-label="Copier le code"
        className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-lg border border-border/60 bg-background/70 text-muted-foreground opacity-0 backdrop-blur-sm transition hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
      >
        {copied ? (
          <Check className="size-4 text-emerald-500" />
        ) : (
          <Copy className="size-4" />
        )}
      </button>
    </div>
  );
}
