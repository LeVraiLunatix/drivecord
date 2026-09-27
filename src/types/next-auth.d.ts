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
    /** Revision of the one-off name/avatar backfill from DB (see auth.ts). */
    picRev?: number;
    /**
     * `User.passwordChangedAt` (ms epoch, or null) as last observed by the
     * `jwt` callback. A mismatch against the current DB value means the
     * password changed after this JWT was minted — the callback returns
     * `null` to invalidate it (see auth.ts).
     */
    pwdChangedAt?: number | null;
  }
}

declare module "next-auth" {
  interface Session {
    level?: AuthLevel;
    pendingReason?: PendingReason;
  }
}
