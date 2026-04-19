import PublicBooksPageClient from "./PublicBooksPageClient";
import {
  createPageMetadata,
  getPublicLibraryMetadata,
} from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const stats = await getPublicLibraryMetadata();
  const description = stats
    ? stats.totalPagesRead > 0
      ? `Browse ${stats.totalBooks} public reading journeys with ${stats.completed} completed books and ${stats.totalPagesRead.toLocaleString()} pages read.`
      : `Browse ${stats.totalBooks} public reading journeys with ${stats.completed} completed books.`
    : "Browse public reading journeys and discover how readers are tracking their books.";

  return createPageMetadata({
    title: "Public Reading Tracker",
    description,
    path: "/public",
  });
}

export default function PublicBooksPage() {
  return <PublicBooksPageClient />;
}
