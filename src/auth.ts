/**
 * Full Auth.js v5 configuration (Node.js runtime only).
 * Includes Prisma adapter, bcrypt, all providers, and the step-up jwt callback.
 */
import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import Discord from "next-auth/providers/discord";
import Patreon from "next-auth/providers/patreon";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { authConfig } from "@/auth.config";
import { evaluateUserLevel } from "@/lib/auth/auth-level";
import { syncUserPatreonTier } from "@/lib/patreon";
import { syncDiscordRoles } from "@/lib/discord-roles";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  // JWT strategy required when using Credentials provider alongside an adapter
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    /**
     * Node-runtime jwt callback: computes the step-up level from DB state on
     * sign-in (and update), and slides the 24h window by stamping lastLoginAt
     * whenever the session opens fully.
     */
    async jwt({ token, user, trigger, account, profile }) {
      if (user?.id) token.id = user.id;
      const uid = (token.id as string | undefined) ?? token.sub;

      // Discord avatars change (Nitro users have animated `a_…` ones). The
      // Prisma adapter only sets `user.image` at first link, so refresh it — and
      // the JWT `picture` — from the fresh profile on every Discord sign-in.
      if (trigger === "signIn" && account?.provider === "discord" && profile) {
        const p = profile as {
          id?: string;
          avatar?: string | null;
          image_url?: string;
        };
        let image: string | undefined;
        if (typeof p.avatar === "string" && p.avatar && p.id) {
          const ext = p.avatar.startsWith("a_") ? "gif" : "png";
          image = `https://cdn.discordapp.com/avatars/${p.id}/${p.avatar}.${ext}?size=128`;
        } else if (typeof p.image_url === "string" && p.image_url) {
          image = p.image_url;
        }
        if (image) {
          token.picture = image;
          if (uid) {
            await prisma.user
              .update({ where: { id: uid }, data: { image } })
              .catch(() => {});
          }
        }
      }

      if (
        uid &&
        (trigger === "signIn" || trigger === "signUp" || trigger === "update")
      ) {
        const result = await evaluateUserLevel(uid);
        if (result) {
          token.level = result.level;
          token.pendingReason = result.reason;
          if (result.level === "full") {
            await prisma.user
              .update({ where: { id: uid }, data: { lastLoginAt: new Date() } })
              .catch(() => {});
          }
        }
      }

      // One-off: pull name/avatar from the DB into stale existing tokens
      // (they're only set at sign-in, so an avatar change never propagated to
      // long-lived sessions). Runs once per token, then the flag skips it.
      // Bump `PIC_REV` to force a re-sync for everyone.
      const PIC_REV = 1;
      if (uid && token.picRev !== PIC_REV) {
        const u = await prisma.user
          .findUnique({ where: { id: uid }, select: { image: true, name: true } })
          .catch(() => null);
        if (u) {
          token.picture = u.image;
          token.name = u.name;
        }
        token.picRev = PIC_REV;
      }
      // Legacy tokens minted before step-up existed are treated as full.
      if (token.level === undefined) token.level = "full";
      return token;
    },
  },
  events: {
    // Dès qu'un compte Patreon est lié à l'utilisateur courant, on récupère son
    // palier depuis l'API et on le stocke. Non bloquant : un échec réseau ne
    // doit pas casser le linking (le palier sera resynchronisé au refresh manuel
    // ou par le webhook).
    async linkAccount({ user, account }) {
      if (account.provider === "patreon" && user.id) {
        await syncUserPatreonTier(user.id).catch(() => {});
      }
      // Quelqu'un (re)lie Discord : s'il est déjà abonné, on lui pose son rôle.
      if (account.provider === "discord" && user.id) {
        await syncDiscordRoles(user.id).catch(() => {});
      }
    },
  },
  providers: [
    // Force Google to always show the account chooser. Without this, the
    // in-app WebView silently re-signs in the last Google account, so trying
    // to switch accounts kept logging back into the first one.
    Google({
      authorization: { params: { prompt: "select_account" } },
      // Link to an existing account with the same (verified) email instead of
      // failing with OAuthAccountNotLinked. Safe here: Google verifies emails.
      allowDangerousEmailAccountLinking: true,
    }),

    // Discord OAuth — works inside the in-app WebView (unlike Google).
    // Reads AUTH_DISCORD_ID / AUTH_DISCORD_SECRET. `prompt: consent` forces
    // the account chooser so users can switch Discord accounts.
    Discord({
      authorization: {
        params: { scope: "identify email", prompt: "consent" },
      },
      allowDangerousEmailAccountLinking: true,
    }),

    // Patreon — sert au LINKING d'un compte déjà connecté (déblocage des
    // paliers), pas au login principal. Lit AUTH_PATREON_ID / AUTH_PATREON_SECRET.
    // Le scope `identity.memberships` est requis pour lire le palier engagé.
    Patreon({
      authorization: {
        params: { scope: "identity identity[email] identity.memberships" },
      },
      allowDangerousEmailAccountLinking: true,
    }),

    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Mot de passe", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;
        if (!email || !password) return null;

        const user = await prisma.user.findUnique({ where: { email } });
        if (!user || !user.password) return null;

        const valid = await bcrypt.compare(password, user.password);
        if (!valid) return null;

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          image: user.image,
        };
      },
    }),
  ],
});
