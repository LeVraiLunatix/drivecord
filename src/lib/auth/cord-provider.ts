import type { NextAuthConfig } from "next-auth";

/** One Cord identity across the suite. Existing Drivecord accounts link explicitly. */
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
        allowDangerousEmailAccountLinking: false,
        profile(profile) {
          if (profile.email_verified !== true) throw new Error("Confirme ton adresse email dans Compte Cord avant de te connecter.");
          return { id: profile.sub, name: profile.name, email: profile.email, image: null };
        },
      }]
    : [];
