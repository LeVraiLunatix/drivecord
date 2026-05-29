import { AppHomeGate } from "@/components/app-home-gate";
import { Landing } from "@/components/home/landing";

export default function Home() {
  return (
    <AppHomeGate>
      <Landing />
    </AppHomeGate>
  );
}
