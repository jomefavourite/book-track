"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import CalendarView from "@/components/CalendarView";
import DaysView from "@/components/DaysView";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const bookId = params.id as Id<"books">;
  const { data: book, isPending } = useQuery(
    convexQuery(api.books.getBook, { bookId })
  );

  if (isPending || book === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  if (book === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">Book not found</div>
          <Link
            href="/"
            className="text-blue-600 hover:underline dark:text-blue-400"
          >
            Go back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-3 sm:p-6">
      <div className="mb-4 sm:mb-6">
        <div className="mb-3 flex items-center justify-between sm:mb-4">
          <Link
            href="/"
            className="text-sm text-blue-600 hover:underline dark:text-blue-400 sm:text-base"
          >
            ← Back
          </Link>
          <ThemeSwitcher />
        </div>
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50 sm:text-3xl">
          {book.name}
        </h1>
        <div className="mt-2 space-y-1 text-sm text-zinc-600 dark:text-zinc-400 sm:text-base">
          <p>Total Pages: {book.totalPages}</p>
          <p>
            Mode: {book.readingMode === "calendar" ? "Calendar" : "Fixed Days"}
          </p>
          {book.readingMode === "calendar" &&
            book.startMonth &&
            book.endMonth && (
              <p>
                Period: {book.startMonth} {book.startYear} - {book.endMonth}{" "}
                {book.endYear}
              </p>
            )}
          {book.readingMode === "fixed-days" && book.daysToRead && (
            <p>Days to Read: {book.daysToRead}</p>
          )}
        </div>
      </div>

      {book.readingMode === "calendar" ? (
        <CalendarView
          bookId={bookId}
          book={book}
        />
      ) : (
        <DaysView
          bookId={bookId}
          book={book}
        />
      )}
    </div>
  );
}
