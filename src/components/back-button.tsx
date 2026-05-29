"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Reusable back button. Uses browser history when available, otherwise
 * navigates to `fallback`. Especially useful in the native app where there's
 * no browser chrome / hardware back button on iOS.
 */
export function BackButton({
  fallback = "/",
  label = "Retour",
  className,
}: {
  fallback?: string;
  label?: string;
  className?: string;
}) {
  const router = useRouter();

  const onClick = React.useCallback(() => {
    // history.length > 1 means there's somewhere to go back to.
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push(fallback);
    }
  }, [router, fallback]);

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={onClick}
      className={cn("gap-1 text-muted-foreground hover:text-foreground", className)}
    >
      <ChevronLeft className="size-4" />
      {label}
    </Button>
  );
}
