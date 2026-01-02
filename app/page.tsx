"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import BookCard from "@/components/BookCard";
import ThemeSwitcher from "@/components/ThemeSwitcher";

export default function Home() {
  const { data: books, isPending } = useQuery(
    convexQuery(api.books.getBooks, {})
  );

  const booksWithProgress = books || [];

  let content = null;
  if (isPending && books === undefined) {
    content = (
      <div className="mx-auto max-w-6xl p-6">
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-lg text-zinc-600 dark:text-zinc-400">
            Loading books...
          </div>
        </div>
      </div>
    );
  } else {
    content = (
      <div>
        {booksWithProgress.length === 0 ? (
          <div className="rounded-lg border border-zinc-200 bg-white p-12 text-center dark:border-zinc-800 dark:bg-zinc-900">
            <p className="mb-4 text-lg text-zinc-600 dark:text-zinc-400">
              No books yet. Add your first book to get started!
            </p>
            <Link
              href="/books/new"
              className="inline-block rounded-md bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Add Book
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {booksWithProgress.map((book: any) => (
              <BookCard
                key={book._id}
                book={book}
                progress={book.progress || 0}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-4xl font-bold text-zinc-900 dark:text-zinc-50">
            Book-Track
          </h1>
          <p className="mt-2 text-zinc-600 dark:text-zinc-400">
            Track your reading progress
          </p>
        </div>
        <ThemeSwitcher />
      </div>

      <div className="mb-6">
        <Link
          href="/books/new"
          className="inline-block rounded-md bg-zinc-900 px-6 py-3 font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          + Add New Book
        </Link>
      </div>

      {content}
    </div>
  );
}
