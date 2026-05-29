"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { isNativeApp } from "@/lib/use-platform";

/**
 * Renders the animated home ({children}) on web, and in the native app for
 * logged-out users. The only app-specific behaviour: an already-authenticated
 * user opening the app skips the home and lands straight on /drive (the
 * Capacitor splash covers that brief redirect).
 */
export function AppHomeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  // null = not yet checked (SSR + first paint), then true/false on the client.
  const [isNative, setIsNative] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  const shouldRedirect = isNative === true && status === "authenticated";

  React.useEffect(() => {
    if (shouldRedirect) router.replace("/drive");
  }, [shouldRedirect, router]);

  if (shouldRedirect) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-background">
        <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
      </div>
    );
  }

  // Everyone else (web, or logged-out app users) → the animated home.
  return <>{children}</>;
}
