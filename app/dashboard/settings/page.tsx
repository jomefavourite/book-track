import type { Metadata } from "next";
import SettingsPageClient from "./SettingsPageClient";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Reminder Settings",
  description: "Manage reading reminders and notification preferences.",
  path: "/dashboard/settings",
  noIndex: true,
});

export default function SettingsPage() {
  return <SettingsPageClient />;
}
