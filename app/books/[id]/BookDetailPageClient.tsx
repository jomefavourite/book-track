"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser, SignInButton } from "@clerk/nextjs";
import { format, differenceInDays } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { computeReadingProgressSummary } from "@/lib/readingProgressSummary";
import ReadingProgressStatusBanner from "@/components/ReadingProgressStatusBanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import CalendarView from "@/components/CalendarView";
import DaysView from "@/components/DaysView";
import Navigation from "@/components/Navigation";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Share2, Check, ChevronDown, CheckCircle2 } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function BookDetailPage() {
  const params = useParams();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const bookId = params.id as Id<"books">;
  const [copied, setCopied] = useState(false);
  const [markCompleteOpen, setMarkCompleteOpen] = useState(false);
  const [clearMarkCompleteOpen, setClearMarkCompleteOpen] = useState(false);
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

  const progressSummary = useMemo(
    () => (book ? computeReadingProgressSummary(book, sessions) : null),
    [book, sessions]
  );

  const sessionProgressPercent = useMemo(() => {
    if (!book || book.totalPages <= 0) return 0;
    const totalPagesRead = sessions.reduce((sum, session) => {
      if (session.isRead && !session.isMissed) {
        return sum + (session.actualPages ?? session.plannedPages ?? 0);
      }
      return sum;
    }, 0);
    return (totalPagesRead / book.totalPages) * 100;
  }, [book, sessions]);

  const invalidateBookProgressQueries = async () => {
    await queryClient.invalidateQueries({
      queryKey: convexQuery(api.books.getBook, {
        bookId,
        userId: user?.id,
      }).queryKey,
    });
    await queryClient.invalidateQueries({
      queryKey: convexQuery(api.readingSessions.getSessionsForBook, {
        bookId,
        userId: user?.id,
      }).queryKey,
    });
    if (user?.id) {
      await queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, { userId: user.id })
          .queryKey,
      });
    }
  };

  const markBookCompletedMutation = useConvexMutation(api.books.markBookCompleted);
  const { mutateAsync: markBookCompleted, isPending: markCompletePending } =
    useMutation({
      mutationFn: markBookCompletedMutation,
      onSuccess: invalidateBookProgressQueries,
    });

  const clearMarkedCompleteMutation = useConvexMutation(
    api.books.clearMarkedComplete
  );
  const { mutateAsync: clearMarkedComplete, isPending: clearMarkCompletePending } =
    useMutation({
      mutationFn: clearMarkedCompleteMutation,
      onSuccess: invalidateBookProgressQueries,
    });

  const showMarkCompleteButton =
    Boolean(canEdit && book && !book.markedCompleteAt && sessionProgressPercent < 100);

  const showClearMarkedCompleteButton =
    Boolean(canEdit && book && book.markedCompleteAt != null);

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
      <Navigation />
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
              {showMarkCompleteButton && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setMarkCompleteOpen(true)}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="hidden sm:inline">Mark completed</span>
                </Button>
              )}
              {showClearMarkedCompleteButton && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={() => setClearMarkCompleteOpen(true)}
                >
                  <span className="hidden sm:inline">Remove marked complete</span>
                  <span className="sm:hidden">Undo complete</span>
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
              {book.markedCompleteAt != null && (
                <span className="rounded-full bg-primary/15 px-2 py-1 text-xs font-medium text-primary">
                  Marked complete
                </span>
              )}
            </div>
          </div>
          <div className="mt-2 space-y-1 text-sm text-muted-foreground sm:text-base">
            <p>Total Pages: {book.totalPages}</p>
            <p>
              Mode:{" "}
              {book.readingMode === "calendar" ? "Calendar" : "Fixed Days"}
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
                <Link
                  href={`/user/${book.userId}`}
                  className="text-primary underline hover:no-underline"
                >
                  {book.creatorName ||
                    book.creatorEmail?.split("@")[0] ||
                    "Anonymous"}
                </Link>
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
                  <span className="text-sm text-muted-foreground">
                    Progress:
                  </span>
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
                {progressSummary.showExpectedDropdown && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-auto py-1.5 text-sm text-muted-foreground hover:text-foreground"
                      >
                        Expected for each day unaccounted
                        <ChevronDown className="ml-1 h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                      align="start"
                      className="max-h-48 min-w-48 overflow-y-auto"
                    >
                      {progressSummary.expectedPerUnaccountedDay.map(
                        (item) => (
                          <DropdownMenuItem
                            key={item.key}
                            className="cursor-default"
                          >
                            {item.label}: Page {item.expectedPage}
                          </DropdownMenuItem>
                        )
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                <ReadingProgressStatusBanner
                  showStatusBanner={progressSummary.showStatusBanner}
                  isAhead={progressSummary.isAhead}
                  isBehind={progressSummary.isBehind}
                  pagesDifference={progressSummary.pagesDifference}
                />
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

      <Dialog open={markCompleteOpen} onOpenChange={setMarkCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this book as completed?</DialogTitle>
            <DialogDescription>
              This records the book as fully read without updating each day you
              tracked. Your existing session data is kept, but progress will show
              as 100% everywhere. You can still edit the book or log days below
              if you want.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setMarkCompleteOpen(false)}
              disabled={markCompletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={markCompletePending || !user?.id}
              onClick={async () => {
                if (!user?.id) return;
                try {
                  await markBookCompleted({ bookId, userId: user.id });
                  setMarkCompleteOpen(false);
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              {markCompletePending ? "Saving…" : "Mark completed"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={clearMarkCompleteOpen} onOpenChange={setClearMarkCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove marked complete?</DialogTitle>
            <DialogDescription>
              Progress will go back to what your daily sessions show. You can mark
              the book completed again anytime.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setClearMarkCompleteOpen(false)}
              disabled={clearMarkCompletePending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={clearMarkCompletePending || !user?.id}
              onClick={async () => {
                if (!user?.id) return;
                try {
                  await clearMarkedComplete({ bookId, userId: user.id });
                  setClearMarkCompleteOpen(false);
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              {clearMarkCompletePending ? "Removing…" : "Remove"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
