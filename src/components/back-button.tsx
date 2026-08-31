"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Reusable back button. Navigates straight to `fallback` (the logical parent
 * of the page) for predictable behaviour — `router.back()` was sending users
 * to unexpected pages depending on their navigation history.
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
    router.push(fallback);
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
