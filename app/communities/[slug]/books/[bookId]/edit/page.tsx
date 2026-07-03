import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import EditCommunityBookPageClient from "./EditCommunityBookPageClient";

export const metadata: Metadata = createPageMetadata({
  title: "Edit Community Book",
  description: "Edit a shared book for a Book-Trackr community.",
  path: "/communities",
  noIndex: true,
});

export default function EditCommunityBookPage() {
  return <EditCommunityBookPageClient />;
}
