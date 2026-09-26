import type { NextAuthConfig, User } from "next-auth";
import { isCordAvatar } from "@/lib/auth/cord-shared";

type CordProfile = {
  sub: string;
  name?: string | null;
  email?: string | null;
  email_verified?: boolean;
  picture?: string;
};

/**
 * One Cord identity across the suite. Existing Drivecord accounts link
 * explicitly from Settings (never by matching email).
 *
 * `idToken: false`: Auth.js still validates the id_token (signature, nonce,
 * audience) but then reads the profile from `/oauth/userinfo`, the only place
 * Cord exposes `picture` (checked against the id_token `sub`).
 * An unverified email is refused in the `signIn` callback (auth.ts), which can
 * redirect to a clear message — throwing here would end on a generic error.
 */
export const cordProviders: NextAuthConfig["providers"] =
  process.env.AUTH_CORD_ISSUER && process.env.AUTH_CORD_ID && process.env.AUTH_CORD_SECRET
    ? [{
        id: "cord",
        name: "Compte Cord",
        type: "oidc",
        issuer: process.env.AUTH_CORD_ISSUER,
        clientId: process.env.AUTH_CORD_ID,
        clientSecret: process.env.AUTH_CORD_SECRET,
        authorization: { params: { scope: "openid profile email" } },
        checks: ["pkce", "state", "nonce"],
        client: { token_endpoint_auth_method: "client_secret_post" },
        idToken: false,
        allowDangerousEmailAccountLinking: false,
        // emailVerified is set after creation by syncCordProfile (Auth.js
        // forces it to null for OAuth users).
        profile(profile: CordProfile): User {
          return {
            id: profile.sub,
            name: profile.name ?? null,
            email: profile.email ?? null,
            image: isCordAvatar(profile.picture, process.env.AUTH_CORD_ISSUER) ? profile.picture! : null,
          };
        },
      }]
    : [];
