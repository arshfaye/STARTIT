import type { Metadata } from "next";
import AppShell from "@/components/AppShell";

export const metadata: Metadata = { title: "STARTIT", robots: { index: false } };

export default function AppPage() {
  return <AppShell />;
}
