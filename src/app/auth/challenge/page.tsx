import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ChallengeForm } from "@/components/auth/challenge-form";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";

/**
 * Step-up challenge screen. Reachable only with a *pending* session; routes to
 * the 2FA screen or the email-code screen depending on the pending reason.
 */
export default async function ChallengePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.level !== "pending") redirect("/drive");

  const email = session.user.email ?? "";
  const reason = session.pendingReason ?? "login_24h";

  if (reason === "2fa") {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { twoFactorMethod: true },
    });
    return (
      <TwoFactorChallenge email={email} method={user?.twoFactorMethod ?? "totp"} />
    );
  }

  return <ChallengeForm email={email} reason={reason} />;
}
