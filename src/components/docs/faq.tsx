"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Conteneur d'une liste de questions/réponses (accordéon). */
export function Faq({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div className={cn("my-6 flex flex-col gap-2.5", className)} {...props} />
  );
}

/**
 * Une question dépliable, avec ouverture/fermeture animée. La hauteur réelle du
 * contenu est mesurée (`scrollHeight`) puis animée de 0 → mesure en CSS :
 * fluide, fiable, et le contenu reste dans le DOM même replié.
 */
export function FaqItem({
  q,
  children,
}: {
  q: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(false);
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [height, setHeight] = React.useState(0);

  React.useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    setHeight(open ? el.scrollHeight : 0);
  }, [open, children]);

  return (
    <div
      className={cn(
        "overflow-hidden rounded-2xl border transition-colors duration-200",
        open ? "border-border bg-card/60" : "border-border/50 bg-card/40"
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left font-medium text-foreground"
      >
        <span>{q}</span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-300 ease-out",
            open && "rotate-180"
          )}
        />
      </button>

      <div
        className="overflow-hidden transition-all duration-300 ease-out"
        style={{ height, opacity: open ? 1 : 0 }}
      >
        <div ref={innerRef} className="px-5 pb-4">
          {children}
        </div>
      </div>
    </div>
  );
}
