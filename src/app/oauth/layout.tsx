import { E2eeGate } from "@/components/e2ee/e2ee-gate";

/** Granting an app access needs the drive key (the app folder's name is encrypted on this device). */
export default function OAuthLayout({ children }: { children: React.ReactNode }) {
  return <E2eeGate>{children}</E2eeGate>;
}
