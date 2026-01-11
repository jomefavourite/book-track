"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser, SignInButton } from "@clerk/nextjs";
import {
  format,
  differenceInDays,
  isBefore,
  isAfter,
  isToday as isTodayDate,
} from "date-fns";
import {
  parseDateFromStorage,
  formatDateForStorage,
  getAllDaysInRange,
} from "@/lib/dateUtils";
import { distributePagesAcrossDays } from "@/lib/readingCalculator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import CalendarView from "@/components/CalendarView";
import DaysView from "@/components/DaysView";
import Navigation from "@/components/Navigation";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Share2, Check } from "lucide-react";

export default function BookDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user, isLoaded } = useUser();
  const bookId = params.id as Id<"books">;
  const [copied, setCopied] = useState(false);
  const {
    data: book,
    isPending,
    error,
  } = useQuery({
    ...convexQuery(api.books.getBook, { bookId, userId: user?.id }),
    enabled: true, // Allow querying even without auth (for public books)
    retry: false, // Don't retry on error to show private book message
  });

  // Get reading sessions for progress calculation
  const { data: sessions = [] } = useQuery({
    ...convexQuery(api.readingSessions.getSessionsForBook, {
      bookId,
      userId: user?.id,
    }),
    enabled: Boolean(
      book && (book.isPublic || (user?.id && book.userId === user.id))
    ),
  });

  const isOwner = user?.id && book?.userId === user.id;
  const isPublicBook = book?.isPublic;
  const canEdit = Boolean(isOwner);

  // Check if this is a private book access error
  // Handle both Error objects and Convex error responses
  const errorMessage =
    error instanceof Error
      ? error.message
      : (error as any)?.message || String(error || "");
  const isPrivateBookError =
    error &&
    (errorMessage === "Unauthorized" ||
      errorMessage === "Not authenticated" ||
      errorMessage.includes("Unauthorized") ||
      errorMessage.includes("Not authenticated"));

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-999999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        alert("Failed to copy link. Please copy manually: " + url);
      }
      document.body.removeChild(textArea);
    }
  };

  // Calculate progress summary
  const progressSummary = useMemo(() => {
    if (!book) return null;

    const startDate = parseDateFromStorage(book.startDate);
    const endDate = parseDateFromStorage(book.endDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate total pages read
    const totalPagesRead = sessions.reduce((sum, session) => {
      if (session.isRead) {
        return sum + (session.actualPages || session.plannedPages || 0);
      }
      return sum;
    }, 0);

    // Calculate what page should be read today
    const pageDistribution = distributePagesAcrossDays(
      book.totalPages,
      startDate,
      endDate
    );

    const allDays = getAllDaysInRange(startDate, endDate);
    let expectedPageByToday = 0;

    for (const day of allDays) {
      const dayKey = formatDateForStorage(day);
      const dayPages = pageDistribution.get(dayKey) || 0;

      if (isBefore(day, today) || isTodayDate(day)) {
        expectedPageByToday += dayPages;
      } else {
        break;
      }
    }

    const progressPercentage = (totalPagesRead / book.totalPages) * 100;
    const isAhead = totalPagesRead > expectedPageByToday;
    const isBehind = totalPagesRead < expectedPageByToday;
    const pagesDifference = Math.abs(totalPagesRead - expectedPageByToday);

    return {
      totalPagesRead,
      expectedPageByToday,
      progressPercentage,
      isAhead,
      isBehind,
      pagesDifference,
      totalPages: book.totalPages,
    };
  }, [book, sessions]);

  // Show private book message first (even if still pending, if we have the error)
  if (isPrivateBookError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg text-foreground">
            This book is private
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            You don't have permission to view this book.
          </p>
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

  // Show loading only if we don't have an error and don't have data yet
  if (isPending && !error && book === undefined) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  // Show book not found if book is null and no error
  if (book === null && !error) {
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

  // If we have an error that's not a private book error, show generic error
  if (error && !isPrivateBookError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg text-foreground">Error loading book</div>
          <p className="mb-4 text-sm text-muted-foreground">
            {errorMessage || "An error occurred"}
          </p>
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

  // Ensure book exists before rendering
  if (!book) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg">Loading...</div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Navigation showAuth={false} />
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
            {isPublicBook && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleShare}
                className="h-8 gap-2"
              >
                {copied ? (
                  <>
                    <Check className="h-4 w-4" />
                    <span className="hidden sm:inline">Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="h-4 w-4" />
                    <span className="hidden sm:inline">Share</span>
                  </>
                )}
              </Button>
            )}
            {canEdit && (
              <Button
                variant="outline"
                size="sm"
                asChild
              >
                <Link href={`/books/${bookId}/edit`}>Edit</Link>
              </Button>
            )}
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
          <div className="flex items-center gap-2">
            {isPublicBook && (
              <>
                <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
                  Public
                </span>
              </>
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

              // Always show actual dates with month, day, and year
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

        {/* Progress Summary */}
        {progressSummary && (
          <Card className="mt-4 p-4">
            <h3 className="mb-3 text-lg font-semibold text-foreground">
              Reading Progress Summary
            </h3>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Pages Read:
                </span>
                <span className="font-medium text-foreground">
                  {progressSummary.totalPagesRead} /{" "}
                  {progressSummary.totalPages}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Progress:</span>
                <span className="font-medium text-foreground">
                  {progressSummary.progressPercentage.toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">
                  Expected by Today:
                </span>
                <span className="font-medium text-foreground">
                  Page {progressSummary.expectedPageByToday}
                </span>
              </div>
              {progressSummary.isAhead &&
                progressSummary.pagesDifference > 0 && (
                  <div className="mt-2 rounded-md bg-green-100 p-2 text-sm text-green-800 dark:bg-green-900 dark:text-green-200">
                    🎉 You're {progressSummary.pagesDifference} page
                    {progressSummary.pagesDifference !== 1 ? "s" : ""} ahead of
                    schedule!
                  </div>
                )}
              {progressSummary.isBehind &&
                progressSummary.pagesDifference > 0 && (
                  <div className="mt-2 rounded-md bg-amber-100 p-2 text-sm text-amber-800 dark:bg-amber-900 dark:text-amber-200">
                    ⚠️ You're {progressSummary.pagesDifference} page
                    {progressSummary.pagesDifference !== 1 ? "s" : ""} behind
                    schedule. Keep going!
                  </div>
                )}
              {!progressSummary.isAhead && !progressSummary.isBehind && (
                <div className="mt-2 rounded-md bg-blue-100 p-2 text-sm text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  ✓ You're right on track!
                </div>
              )}
            </div>
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
    </>
  );
}
