import { E2eeGate } from "@/components/e2ee/e2ee-gate";

/** Uploading / adding a drive needs the end-to-end keys: unlock (or set them up) first. */
export default function Layout({ children }: { children: React.ReactNode }) {
  return <E2eeGate>{children}</E2eeGate>;
}
