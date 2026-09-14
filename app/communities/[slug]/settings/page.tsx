import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import CommunitySettingsPageClient from "./CommunitySettingsPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Community Settings",
  description: "Manage a BookTrackr community.",
  path: "/communities",
  noIndex: true,
});

export default function CommunitySettingsPage() {
  return <CommunitySettingsPageClient />;
}
