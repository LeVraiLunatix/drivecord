import { DiscordClientProvider } from "@/lib/discord/context";
import { WebhookSyncProvider } from "@/components/auth/webhook-sync-provider";

export default function DriveLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DiscordClientProvider>
      <WebhookSyncProvider>{children}</WebhookSyncProvider>
    </DiscordClientProvider>
  );
}
