import type { AuthLevel, PendingReason } from "@/lib/auth/auth-level";

/**
 * Module augmentation: carry the step-up auth `level` (and the reason a session
 * is still pending) on both the JWT and the Session.
 */
declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    level?: AuthLevel;
    pendingReason?: PendingReason;
  }
}

declare module "next-auth" {
  interface Session {
    level?: AuthLevel;
    pendingReason?: PendingReason;
  }
}
