/**
 * Compte Cord — server side (Node runtime): link guard for the `signIn`
 * callback and profile sync for the `jwt` callback. See cord-shared.ts for the
 * pure rules.
 */
import { cookies } from "next/headers";
import { decode } from "next-auth/jwt";
import type { Account, Profile } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sessionCookieName } from "@/lib/auth/session-token";
import { nextImageAfterCord } from "@/lib/auth/cord-shared";

type CurrentSession = { userId: string; level: string };

/** Session already open in this browser (the account Cord would be linked to), if any. */
async function currentSession(): Promise<CurrentSession | null> {
  const jar = await cookies();
  for (const secure of [true, false]) {
    const name = sessionCookieName(secure);
    // Auth.js splits big cookies into `<name>.0`, `<name>.1`…
    const token =
      jar.get(name)?.value ??
      (jar
        .getAll()
        .filter((c) => c.name.startsWith(`${name}.`))
        .sort((a, b) => Number(a.name.slice(name.length + 1)) - Number(b.name.slice(name.length + 1)))
        .map((c) => c.value)
        .join("") || undefined);
    if (!token) continue;
    const payload = await decode({ token, secret: process.env.AUTH_SECRET!, salt: name }).catch(() => null);
    const userId = (payload?.id as string | undefined) ?? payload?.sub;
    if (userId) return { userId, level: (payload?.level as string | undefined) ?? "full" };
  }
  return null;
}

/**
 * `signIn` callback for Cord. Returns `true` to continue, or a URL to redirect
 * to with a clear error instead of Auth.js' generic one.
 */
export async function cordSignInGuard(account: Account, profile: Profile | undefined): Promise<true | string> {
  if (profile?.email_verified !== true) return "/login?error=CordEmailNotVerified";

  const session = await currentSession();
  if (!session) return true; // plain sign-in / sign-up

  const owner = await prisma.account.findUnique({
    where: { provider_providerAccountId: { provider: "cord", providerAccountId: account.providerAccountId } },
    select: { userId: true },
  });
  if (owner?.userId === session.userId) return true; // already linked: re-auth
  // Auth.js would throw OAuthAccountNotLinked, which reads like the
  // "email already exists" case — say what actually happened.
  if (owner) return "/settings?cordError=CordAlreadyLinked";
  // Explicit linking from Settings: only a fully authenticated session may add
  // a sign-in method (a pending one hasn't passed its 2FA / email code yet).
  if (session.level !== "full") return "/login?error=CordLinkNeedsFullSession";
  return true;
}

/**
 * After a Cord sign-in (or link): keep the stored tokens fresh (the id_token
 * gives the Cord name/email shown in Settings), fill an empty avatar with the
 * Cord photo, and fill an empty name. Never overwrites a name set by hand.
 * Returns what changed so the caller can update the JWT.
 */
export async function syncCordProfile(
  userId: string,
  account: Account,
  profile: Profile | undefined,
): Promise<{ image?: string | null; name?: string }> {
  await prisma.account
    .update({
      where: { provider_providerAccountId: { provider: "cord", providerAccountId: account.providerAccountId } },
      data: {
        ...(account.id_token ? { id_token: account.id_token } : {}),
        ...(account.access_token ? { access_token: account.access_token } : {}),
        ...(account.expires_at ? { expires_at: account.expires_at } : {}),
      },
    })
    .catch(() => {});

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { image: true, name: true, email: true, emailVerified: true },
  });
  if (!user) return {};

  // Auth.js creates OAuth users with `emailVerified: null`. Cord has proven
  // this exact address: no need for a second Drivecord verification code.
  if (
    !user.emailVerified &&
    profile?.email_verified === true &&
    typeof profile.email === "string" &&
    profile.email.toLowerCase() === user.email.toLowerCase()
  ) {
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  }

  const changes: { image?: string | null; name?: string } = {};
  const image = nextImageAfterCord(user.image, profile?.picture as string | undefined, process.env.AUTH_CORD_ISSUER);
  if (image !== undefined) changes.image = image;
  if (!user.name && typeof profile?.name === "string" && profile.name.trim()) {
    changes.name = profile.name.trim().slice(0, 60);
  }
  if (Object.keys(changes).length) {
    await prisma.user.update({ where: { id: userId }, data: changes });
  }
  return changes;
}
