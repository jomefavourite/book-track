import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import NewCommunityPageClient from "./NewCommunityPageClient";

export const metadata: Metadata = createPageMetadata({
  title: "Create Community",
  description: "Create a Book-Trackr community.",
  path: "/communities/new",
  noIndex: true,
});

export default function NewCommunityPage() {
  return <NewCommunityPageClient />;
}
