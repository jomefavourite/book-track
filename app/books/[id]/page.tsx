import BookDetailPageClient from "./BookDetailPageClient";
import { createPageMetadata, getPublicBookMetadata } from "@/lib/metadata";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const book = await getPublicBookMetadata(id);

  if (!book) {
    return createPageMetadata({
      title: "Book",
      description: "Follow shared reading progress on Book-Track.",
      path: `/books/${id}`,
      noIndex: true,
    });
  }

  const authorSuffix = book.author ? ` by ${book.author}` : "";
  const progress = Math.round(book.progress ?? 0);
  const creatorPrefix = book.creatorName ? `${book.creatorName}'s ` : "";
  const description =
    book.progressStyle === "chapters" && book.ignorePages
      ? `${creatorPrefix}${book.name}${authorSuffix}. ${progress}% complete across ${book.totalChapters?.toLocaleString() ?? 0} chapters on Book-Track.`
      : `${creatorPrefix}${book.name}${authorSuffix}. ${progress}% complete across ${book.totalPages?.toLocaleString() ?? 0} pages on Book-Track.`;

  return createPageMetadata({
    title: `${book.name}${authorSuffix}`,
    description,
    path: `/books/${id}`,
    openGraphType: "book",
  });
}

export default function BookDetailPage() {
  return <BookDetailPageClient />;
}
