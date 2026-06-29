import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DEVICE_COOKIE } from "@/lib/auth/device";
import { loadTwoFactor } from "@/lib/auth/two-factor";
import { ChallengeForm } from "@/components/auth/challenge-form";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";

/**
 * Step-up challenge screen. Reachable only with a *pending* session; routes to
 * the 2FA screen or the email-code screen (with optional cross-device approval)
 * depending on the pending reason.
 */
export default async function ChallengePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  if (session.level !== "pending") redirect("/drive");

  const email = session.user.email ?? "";
  const reason = session.pendingReason ?? "login_24h";

  if (reason === "2fa") {
    const tf = await loadTwoFactor(session.user.id);
    return (
      <TwoFactorChallenge
        email={email}
        preferred={tf.preferred ?? "totp"}
        totpEnabled={tf.totpEnabled}
        emailEnabled={tf.emailEnabled}
      />
    );
  }

  // Offer cross-device approval only if another trusted device exists.
  let canCrossDevice = false;
  if (reason === "login_24h") {
    const cookieStore = await cookies();
    const deviceId = cookieStore.get(DEVICE_COOKIE)?.value;
    const count = await prisma.trustedDevice.count({
      where: {
        userId: session.user.id,
        ...(deviceId ? { NOT: { deviceId } } : {}),
      },
    });
    canCrossDevice = count > 0;
  }

  return (
    <ChallengeForm email={email} reason={reason} canCrossDevice={canCrossDevice} />
  );
}
