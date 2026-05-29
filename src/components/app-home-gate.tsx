"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { isNativeApp } from "@/lib/use-platform";

/**
 * On the web, renders the marketing landing page ({children}).
 * In the native app (Capacitor), there's no point showing marketing — redirect
 * straight to /drive (if logged in) or /login. The Capacitor splash screen
 * covers this brief redirect so the user never sees the marketing flash.
 */
export function AppHomeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  // null = not yet checked (SSR + first paint), then true/false on the client.
  const [isNative, setIsNative] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  React.useEffect(() => {
    if (isNative !== true || status === "loading") return;
    router.replace(status === "authenticated" ? "/drive" : "/login");
  }, [isNative, status, router]);

  if (isNative === true) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // Web (or not-yet-determined) → show the marketing page with no delay.
  return <>{children}</>;
}
