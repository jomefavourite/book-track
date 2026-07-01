import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import CommunityDetailPageClient from "./CommunityDetailPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Community",
  description: "View a Book-Trackr reading community.",
  path: "/communities",
  noIndex: true,
});

export default function CommunityDetailPage() {
  return <CommunityDetailPageClient />;
}
