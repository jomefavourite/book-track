"use client";

import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser, SignInButton } from "@clerk/nextjs";
import { format, differenceInDays } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import CalendarView from "@/components/CalendarView";
import DaysView from "@/components/DaysView";
import ThemeSwitcher from "@/components/ThemeSwitcher";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const bookId = params.id as Id<"books">;
  const { data: book, isPending } = useQuery({
    ...convexQuery(api.books.getBook, { bookId, userId: user?.id }),
    enabled: true, // Allow querying even without auth (for public books)
  });

  const isOwner = user?.id && book?.userId === user.id;
  const isPublicBook = book?.isPublic;
  const canEdit = isOwner;

  // Debug: Log all book fields
  if (book) {
    console.log("Book object:", book);
    console.log("Book keys:", Object.keys(book));
    console.log("Book author:", book.author);
  }

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
          <div className="mb-4 text-lg text-foreground">Book not found</div>
          <Link
            href={user ? "/dashboard" : "/"}
            className="text-primary hover:underline"
          >
            Go back
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
            href={user ? "/dashboard" : "/"}
            className="text-sm text-primary hover:underline sm:text-base"
          >
            ← Back
          </Link>
          <div className="flex items-center gap-3">
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link href={`/books/${bookId}/edit`}>Edit</Link>
              </Button>
            )}
            <ThemeSwitcher />
          </div>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
              {book.name}
            </h1>
            {book.author && (
              <p className="mt-1 text-lg text-muted-foreground sm:text-xl">
                Author: {book.author}
              </p>
            )}
          </div>
          <div className="flex gap-2">
            {isPublicBook && (
              <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                Public
              </span>
            )}
            {!canEdit && isPublicBook && (
              <span className="rounded-full bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground">
                Read Only
              </span>
            )}
          </div>
        </div>
        <div className="mt-2 space-y-1 text-sm text-muted-foreground sm:text-base">
          <p>Total Pages: {book.totalPages}</p>
          <p>
            Mode: {book.readingMode === "calendar" ? "Calendar" : "Fixed Days"}
          </p>
          {book.readingMode === "calendar" &&
            (() => {
              const start = parseDateFromStorage(book.startDate);
              const end = parseDateFromStorage(book.endDate);
              const days = differenceInDays(end, start) + 1; // +1 to include both start and end days

              // If month/year values are available, show them; otherwise show actual dates
              if (
                book.startMonth &&
                book.endMonth &&
                book.startYear &&
                book.endYear
              ) {
                return (
                  <p>
                    Period: {book.startMonth} {book.startYear} - {book.endMonth}{" "}
                    {book.endYear} ({days} day
                    {days !== 1 ? "s" : ""})
                  </p>
                );
              }
              // Fall back to actual date range
              return (
                <p>
                  Period: {format(start, "MMMM d, yyyy")} -{" "}
                  {format(end, "MMMM d, yyyy")} ({days} day
                  {days !== 1 ? "s" : ""})
                </p>
              );
            })()}
          {book.readingMode === "fixed-days" && book.daysToRead && (
            <p>Days to Read: {book.daysToRead}</p>
          )}
          {isPublicBook && (book.creatorName || book.creatorEmail) && (
            <p className="italic">
              Created by:{" "}
              {book.creatorName ||
                book.creatorEmail?.split("@")[0] ||
                "Anonymous"}
            </p>
          )}
        </div>
        {!user && isPublicBook && (
          <Card className="mt-4 p-4">
            <p className="mb-2 text-sm text-card-foreground">
              Want to track your own reading? Sign in to create your own book
              tracker!
            </p>
            <SignInButton mode="modal">
              <Button
                variant="default"
                size="sm"
              >
                Sign In
              </Button>
            </SignInButton>
          </Card>
        )}
      </div>

      {book.readingMode === "calendar" ? (
        <CalendarView
          bookId={bookId}
          book={book}
          canEdit={canEdit}
        />
      ) : (
        <DaysView
          bookId={bookId}
          book={book}
          canEdit={canEdit}
        />
      )}
    </div>
  );
}
