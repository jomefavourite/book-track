import type { Metadata } from "next";
import BookForm from "@/components/BookForm";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Add Book",
  description: "Create a new reading plan and start tracking your progress.",
  path: "/books/new",
  noIndex: true,
});

export default function NewBookPage() {
  return <BookForm />;
}
