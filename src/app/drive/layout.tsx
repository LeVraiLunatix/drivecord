import { DiscordClientProvider } from "@/lib/discord/context";
import { WebhookSyncProvider } from "@/components/auth/webhook-sync-provider";
import { E2eeGate } from "@/components/e2ee/e2ee-gate";

export default function DriveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DiscordClientProvider>
      <WebhookSyncProvider>
        <E2eeGate>{children}</E2eeGate>
      </WebhookSyncProvider>
    </DiscordClientProvider>
  );
}
