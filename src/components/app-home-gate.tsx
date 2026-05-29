"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { isNativeApp } from "@/lib/use-platform";
import { AppHome } from "@/components/home/app-home";

/**
 * Decides what the root route renders:
 *  - Web                       → {children} (the marketing Landing)
 *  - Native app, logged out    → <AppHome /> (dedicated app welcome screen)
 *  - Native app, authenticated → redirect to /drive (covered by the splash)
 */
export function AppHomeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  // null = not yet checked (SSR + first paint), then true/false on the client.
  const [isNative, setIsNative] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  const authedInApp = isNative === true && status === "authenticated";

  React.useEffect(() => {
    if (authedInApp) router.replace("/drive");
  }, [authedInApp, router]);

  if (authedInApp) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // Logged-out user inside the native app → dedicated app home.
  if (isNative === true) return <AppHome />;

  // Web (or not-yet-determined) → marketing landing.
  return <>{children}</>;
}
