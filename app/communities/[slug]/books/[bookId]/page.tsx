import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import CommunityBookDetailPageClient from "./CommunityBookDetailPageClient";

export const metadata: Metadata = createPageMetadata({
  title: "Community Book",
  description: "Track your reading progress for a community book.",
  path: "/communities",
  noIndex: true,
});

export default function CommunityBookDetailPage() {
  return <CommunityBookDetailPageClient />;
}
