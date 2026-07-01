import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/metadata";
import CommunitiesPageClient from "./CommunitiesPageClient";

export const metadata: Metadata = createPageMetadata({
  title: "Communities",
  description: "Discover and manage Book-Trackr reading communities.",
  path: "/communities",
  noIndex: true,
});

export default function CommunitiesPage() {
  return <CommunitiesPageClient />;
}
