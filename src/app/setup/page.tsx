import type { Metadata } from "next";
import Setup from "@/components/Setup";

export const metadata: Metadata = { title: "Set up API keys · PRD Builder" };

export default function SetupPage() {
  return <Setup />;
}
