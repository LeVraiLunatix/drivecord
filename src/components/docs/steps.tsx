import * as React from "react";
import { cn } from "@/lib/utils";

/** Liste d'étapes numérotées avec un fil vertical (façon « getting started »). */
export function Steps({ children }: { children: React.ReactNode }) {
  const steps = React.Children.toArray(children);
  return (
    <div className="my-6 flex flex-col">
      {steps.map((child, i) => (
        <div key={i} className="flex gap-4">
          <div className="flex flex-col items-center">
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border bg-card font-mono text-sm font-semibold text-foreground">
              {i + 1}
            </div>
            {i < steps.length - 1 && (
              <div className="my-1 w-px flex-1 bg-border" />
            )}
          </div>
          <div className={cn("min-w-0 flex-1", i < steps.length - 1 && "pb-6")}>
            {child}
          </div>
        </div>
      ))}
    </div>
  );
}

export function Step({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="pt-1">
      <h4 className="font-semibold text-foreground">{title}</h4>
      <div className="mt-1 text-sm leading-relaxed text-muted-foreground [&>p]:my-2 [&>p:first-child]:mt-0">
        {children}
      </div>
    </div>
  );
}
