import type { Metadata } from "next";
import { ConditionsContent } from "./conditions-content";

export const metadata: Metadata = {
  title: "Conditions & mentions légales — Drivecord",
};

export default function ConditionsPage() {
  return <ConditionsContent />;
}
