"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { isNativeApp } from "@/lib/use-platform";
import { AppHome } from "@/components/home/app-home";

/**
 * Decides what the root route renders:
 *  - Authenticated (web or app)  → redirect to /drive (never show the
 *    logged-out home, which made navigating to "/" look like a logout)
 *  - Logged-out web              → {children} (marketing Landing)
 *  - Logged-out app              → <AppHome /> (dedicated welcome screen)
 *
 * While the session status is still "loading" we avoid flashing the logged-out
 * home so an authenticated user never briefly sees the sign-in screen.
 */
function Spinner() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <div className="size-8 animate-spin rounded-full border-2 border-border border-t-primary" />
    </div>
  );
}

export function AppHomeGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { status } = useSession();
  // null = not yet checked (SSR + first paint), then true/false on the client.
  const [isNative, setIsNative] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setIsNative(isNativeApp());
  }, []);

  const authed = status === "authenticated";

  React.useEffect(() => {
    if (authed) router.replace("/drive");
  }, [authed, router]);

  // Authenticated anywhere → going to /drive.
  if (authed) return <Spinner />;

  if (isNative === true) {
    // In the app, don't flash the logged-out welcome until we KNOW the status.
    if (status === "loading") return <Spinner />;
    return <AppHome />;
  }

  // Web: marketing landing for logged-out (and during the brief loading window).
  return <>{children}</>;
}
