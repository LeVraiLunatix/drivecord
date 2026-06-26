import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ChallengeForm } from "@/components/auth/challenge-form";

/**
 * Step-up challenge screen. Reachable only with a *pending* session; a full
 * session is bounced to /drive and an anonymous visitor to /login (also enforced
 * by the proxy, re-checked here defensively).
 */
export default async function ChallengePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");
  if (session.level !== "pending") redirect("/drive");

  return (
    <ChallengeForm
      email={session.user.email ?? ""}
      reason={session.pendingReason ?? "login_24h"}
    />
  );
}
