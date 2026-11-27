import type { Metadata } from "next";
import BookForm from "@/components/BookForm";
import { createPageMetadata } from "@/lib/metadata";

export const metadata: Metadata = createPageMetadata({
  title: "Add Book",
  description: "Create a new reading plan and start tracking your progress.",
  path: "/books/new",
  noIndex: true,
});

export default async function NewBookPage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  // ?plan=<plannedBookId> comes from "Start tracking" in the profile's
  // reading plan: BookForm prefills from it and links the new book back.
  return <BookForm plannedBookId={plan} />;
}
