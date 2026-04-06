import type { Metadata } from "next";
import EditBookPageClient from "./EditBookPageClient";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Edit Book",
  description: "Update your reading plan and book details.",
  path: "/books/[id]/edit",
  noIndex: true,
});

export default function EditBookPage() {
  return <EditBookPageClient />;
}
