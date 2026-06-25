import * as React from "react";
import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function CardGrid({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("my-6 grid gap-4 sm:grid-cols-2", className)}
      {...props}
    />
  );
}

export function DocCard({
  href,
  icon: Icon,
  title,
  children,
  disabled,
}: {
  href: string;
  icon?: LucideIcon;
  title: string;
  children?: React.ReactNode;
  /** Carte « bientôt » non cliquable. */
  disabled?: boolean;
}) {
  const inner = (
    <>
      <div className="flex items-center gap-3">
        {Icon && (
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Icon className="size-4.5" />
          </div>
        )}
        <div className="flex-1 font-semibold text-foreground">{title}</div>
        {disabled ? (
          <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Bientôt
          </span>
        ) : (
          <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
        )}
      </div>
      {children && (
        <p className="mt-2 text-sm text-muted-foreground">{children}</p>
      )}
    </>
  );

  if (disabled) {
    return (
      <div className="not-prose-link block h-full rounded-2xl border border-border/50 bg-card/20 p-5 opacity-60">
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={href}
      className="not-prose-link group block h-full rounded-2xl border border-border/50 bg-card/40 p-5 transition-[transform,border-color,background-color] duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:bg-card/80"
    >
      {inner}
    </Link>
  );
}
