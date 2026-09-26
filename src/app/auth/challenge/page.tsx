import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadTwoFactor } from "@/lib/auth/two-factor";
import { ChallengeForm } from "@/components/auth/challenge-form";
import { TwoFactorChallenge } from "@/components/auth/two-factor-challenge";
import { safeNext } from "@/lib/auth/next-url";

/**
 * Step-up challenge screen. Reachable only with a *pending* session; routes to
 * the 2FA screen or the email-code screen depending on the pending reason.
 *
 * L'approbation cross-device n'est PAS proposée ici : c'est désormais une
 * méthode 2FA explicite (opt-in), gérée via la branche `2fa`.
 */
export default async function ChallengePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  // `next` : retour vers /native-handoff quand l'étape se fait dans Safari
  // pour l'app iPhone (voir src/app/native-handoff).
  const next = (await searchParams).next;
  if (session.level !== "pending") redirect(safeNext(typeof next === "string" ? next : null));

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
        deviceEnabled={tf.deviceEnabled}
      />
    );
  }

  return <ChallengeForm email={email} reason={reason} />;
}
