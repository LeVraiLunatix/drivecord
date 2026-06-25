import * as React from "react";
import {
  Info,
  Lightbulb,
  TriangleAlert,
  OctagonAlert,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Variant = "info" | "tip" | "warning" | "danger";

const VARIANTS: Record<
  Variant,
  { icon: LucideIcon; wrap: string; badge: string }
> = {
  info: {
    icon: Info,
    wrap: "border-sky-500/25 bg-sky-500/[0.07]",
    badge: "bg-sky-500/15 text-sky-500",
  },
  tip: {
    icon: Lightbulb,
    wrap: "border-emerald-500/25 bg-emerald-500/[0.07]",
    badge: "bg-emerald-500/15 text-emerald-500",
  },
  warning: {
    icon: TriangleAlert,
    wrap: "border-amber-500/25 bg-amber-500/[0.07]",
    badge: "bg-amber-500/15 text-amber-500",
  },
  danger: {
    icon: OctagonAlert,
    wrap: "border-rose-500/25 bg-rose-500/[0.07]",
    badge: "bg-rose-500/15 text-rose-500",
  },
};

export function Callout({
  variant = "info",
  title,
  children,
}: {
  variant?: Variant;
  title?: string;
  children: React.ReactNode;
}) {
  const { icon: Icon, wrap, badge } = VARIANTS[variant];
  return (
    <div className={cn("my-6 flex gap-3 rounded-2xl border p-4", wrap)}>
      <div
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-lg",
          badge
        )}
      >
        <Icon className="size-4" />
      </div>
      <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted-foreground [&>p]:m-0 [&>p+p]:mt-2">
        {title && (
          <div className="mb-1 font-semibold text-foreground">{title}</div>
        )}
        {children}
      </div>
    </div>
  );
}
