import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import JoinCommunityPageClient from "./JoinCommunityPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = createPageMetadata({
  title: "Join Community",
  description: "Accept a Book-Trackr community invite.",
  path: "/join",
  noIndex: true,
});

export default function JoinCommunityPage() {
  return <JoinCommunityPageClient />;
}
