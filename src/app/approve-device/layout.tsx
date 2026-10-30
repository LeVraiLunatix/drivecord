import { E2eeGate } from "@/components/e2ee/e2ee-gate";

/** Approving a new device seals the Master Key: this device must be unlocked first. */
export default function ApproveDeviceLayout({ children }: { children: React.ReactNode }) {
  return <E2eeGate>{children}</E2eeGate>;
}
