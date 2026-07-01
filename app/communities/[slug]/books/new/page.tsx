import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import NewCommunityBookPageClient from "./NewCommunityBookPageClient";

export const metadata: Metadata = createPageMetadata({
  title: "Add Community Book",
  description: "Create a shared book for a Book-Trackr community.",
  path: "/communities",
  noIndex: true,
});

export default function NewCommunityBookPage() {
  return <NewCommunityBookPageClient />;
}
