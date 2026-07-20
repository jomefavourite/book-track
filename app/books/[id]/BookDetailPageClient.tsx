"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser, SignInButton } from "@clerk/nextjs";
import { format, differenceInDays } from "date-fns";
import { parseDateFromStorage, formatDateForStorage } from "@/lib/dateUtils";
import {
  filterActiveSessions,
  filterStaleSessions,
} from "@/lib/resetGeneration";
import { computeReadingProgressSummary } from "@/lib/readingProgressSummary";
import {
  buildDayBehaviorMap,
  scheduleChapterTargets,
} from "@/lib/scheduleDayType";
import {
  getHighestChapterRead,
  isChapterOnlyBook,
} from "@/lib/chapterTracking";
import ReadingProgressStatusBanner from "@/components/ReadingProgressStatusBanner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import CalendarView from "@/components/CalendarView";
import DaysView from "@/components/DaysView";
import Navigation from "@/components/Navigation";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  BookOpenText,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  MessageSquareText,
  MoreVertical,
  Pencil,
  RotateCcw,
  Share2,
  Users,
} from "lucide-react";
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user } = useUser();
  const bookId = params.id as Id<"books">;
  const [copied, setCopied] = useState(false);
  const [copiedReflections, setCopiedReflections] = useState(false);
  const [progressSummaryOpen, setProgressSummaryOpen] = useState(false);
  const [reflectionsOpen, setReflectionsOpen] = useState(false);
  const [markCompleteOpen, setMarkCompleteOpen] = useState(false);
  const [clearMarkCompleteOpen, setClearMarkCompleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [staleReflectionsOpen, setStaleReflectionsOpen] = useState(false);
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

  const { data: communityInfo } = useQuery(
    convexQuery(
      api.communities.getCommunityForBook,
      book?.communityBookId ? { communityBookId: book.communityBookId } : "skip"
    )
  );

  // Community books follow their community's schedule; personal books have
  // neither query enabled and keep the original even-split behavior.
  const { data: scheduleQuery } = useQuery(
    convexQuery(
      api.communitySchedule.getScheduleForBook,
      book?.communityBookId ? { communityBookId: book.communityBookId } : "skip"
    )
  );
  const { data: dayLabelsQuery } = useQuery(
    convexQuery(
      api.communityDayLabels.listForCommunityBook,
      book?.communityBookId ? { communityBookId: book.communityBookId } : "skip"
    )
  );

  const { data: reflections = [] } = useQuery({
    ...convexQuery(api.readingSessions.getReflectionsForBook, {
      bookId,
      userId: user?.id,
    }),
    enabled: Boolean(
      book && (isOwner || (book.isPublic && book.shareMergedReflection))
    ),
    retry: false,
  });

  // Check if this is a private book access error
  // Handle both Error objects and Convex error responses
  const errorMessage =
    error instanceof Error ? error.message : String(error || "");
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
    } catch {
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
      } catch {
        alert("Failed to copy link. Please copy manually: " + url);
      }
      document.body.removeChild(textArea);
    }
  };

  // Only the current reading cycle counts toward progress; stale (pre-reset)
  // sessions are preserved but excluded here.
  const activeSessions = useMemo(
    () => (book ? filterActiveSessions(sessions, book) : sessions),
    [book, sessions]
  );

  // Reflection notes from previous (reset) reading cycles — read-only. Only the owner
  // receives un-redacted notes from getSessionsForBook, so this stays empty for viewers.
  const staleReflections = useMemo(() => {
    if (!book) return [];
    return filterStaleSessions(sessions, book)
      .filter(
        (session) =>
          session.isRead &&
          !session.isMissed &&
          typeof session.reflectionNote === "string" &&
          session.reflectionNote.trim().length > 0
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }, [book, sessions]);

  const progressSchedule = useMemo(() => {
    if (!book?.communityBookId || !scheduleQuery || scheduleQuery.length === 0) {
      return undefined;
    }
    return {
      behaviorByDate: buildDayBehaviorMap(scheduleQuery, dayLabelsQuery),
      chapterTargetByDate: scheduleChapterTargets(
        scheduleQuery,
        dayLabelsQuery
      ),
    };
  }, [book?.communityBookId, scheduleQuery, dayLabelsQuery]);

  const progressSummary = useMemo(
    () =>
      book
        ? computeReadingProgressSummary(book, activeSessions, progressSchedule)
        : null,
    [book, activeSessions, progressSchedule]
  );
  const chapterMode = book?.progressStyle === "chapters";
  const chapterOnlyMode = book ? isChapterOnlyBook(book) : false;

  const sessionProgressPercent = useMemo(() => {
    if (!book) return 0;
    if (chapterOnlyMode) {
      if (!book.totalChapters || book.totalChapters <= 0) return 0;
      return (
        (getHighestChapterRead(activeSessions, book.totalChapters) /
          book.totalChapters) *
        100
      );
    }
    if (!book.totalPages || book.totalPages <= 0) return 0;
    const totalPagesRead = activeSessions.reduce((sum, session) => {
      if (session.isRead && !session.isMissed) {
        return sum + (session.actualPages ?? session.plannedPages ?? 0);
      }
      return sum;
    }, 0);
    return (totalPagesRead / book.totalPages) * 100;
  }, [book, activeSessions, chapterOnlyMode]);

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
        queryKey: convexQuery(api.books.getBooks, { userId: user.id }).queryKey,
      });
    }
  };

  const markBookCompletedMutation = useConvexMutation(
    api.books.markBookCompleted
  );
  const { mutateAsync: markBookCompleted, isPending: markCompletePending } =
    useMutation({
      mutationFn: markBookCompletedMutation,
      onSuccess: invalidateBookProgressQueries,
    });

  const clearMarkedCompleteMutation = useConvexMutation(
    api.books.clearMarkedComplete
  );
  const {
    mutateAsync: clearMarkedComplete,
    isPending: clearMarkCompletePending,
  } = useMutation({
    mutationFn: clearMarkedCompleteMutation,
    onSuccess: invalidateBookProgressQueries,
  });

  const resetBookMutation = useConvexMutation(api.books.resetBook);
  const { mutateAsync: resetBook, isPending: resetPending } = useMutation({
    mutationFn: resetBookMutation,
    onSuccess: invalidateBookProgressQueries,
  });

  const setMergedReflectionSharingMutation = useConvexMutation(
    api.books.setMergedReflectionSharing
  );
  const {
    mutateAsync: setMergedReflectionSharing,
    isPending: shareReflectionPending,
  } = useMutation({
    mutationFn: setMergedReflectionSharingMutation,
    onSuccess: invalidateBookProgressQueries,
  });

  const mergedReflectionText = useMemo(
    () =>
      reflections
        .map((reflection) => {
          const dateLabel = format(
            parseDateFromStorage(reflection.date),
            "MMMM d, yyyy"
          );
          return `${dateLabel}\n${reflection.reflectionNote}`;
        })
        .join("\n\n"),
    [reflections]
  );

  const handleCopyReflections = async () => {
    if (!mergedReflectionText) return;
    await navigator.clipboard.writeText(mergedReflectionText);
    setCopiedReflections(true);
    setTimeout(() => setCopiedReflections(false), 2000);
  };

  const isCommunityBook = !!book?.communityBookId;

  const showMarkCompleteButton = Boolean(
    canEdit &&
    !isCommunityBook &&
    book &&
    !book.markedCompleteAt &&
    sessionProgressPercent < 100
  );

  const showClearMarkedCompleteButton = Boolean(
    canEdit && !isCommunityBook && book && book.markedCompleteAt != null
  );

  // Show private book message first (even if still pending, if we have the error)
  if (isPrivateBookError) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4 text-lg text-foreground">
            This book is private
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            You don&apos;t have permission to view this book.
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
                  className="h-9 min-h-9 gap-2"
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
              {(isPublicBook ||
                showMarkCompleteButton ||
                showClearMarkedCompleteButton ||
                (canEdit && !isCommunityBook)) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-9 min-h-9 w-9 px-0"
                      aria-label="More actions"
                    >
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {isPublicBook && (
                      <DropdownMenuItem onClick={handleShare}>
                        <Share2 className="mr-2 h-4 w-4" />
                        Share
                      </DropdownMenuItem>
                    )}
                    {canEdit && !isCommunityBook && (
                      <DropdownMenuItem asChild>
                        <Link href={`/books/${bookId}/edit`}>
                          <Pencil className="mr-2 h-4 w-4" />
                          Edit
                        </Link>
                      </DropdownMenuItem>
                    )}
                    {showMarkCompleteButton && (
                      <DropdownMenuItem
                        onClick={() => setMarkCompleteOpen(true)}
                      >
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                        Mark completed
                      </DropdownMenuItem>
                    )}
                    {showClearMarkedCompleteButton && (
                      <DropdownMenuItem
                        onClick={() => setClearMarkCompleteOpen(true)}
                      >
                        Remove marked complete
                      </DropdownMenuItem>
                    )}
                    {canEdit && !isCommunityBook && (
                      <DropdownMenuItem onClick={() => setResetOpen(true)}>
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Reset
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
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
            <div className="flex items-start gap-2">
              {book.communityBookId && communityInfo && (
                <div className="flex flex-col items-end gap-2">
                  <Link
                    href={`/communities/${communityInfo.slug}`}
                    className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors"
                  >
                    <Users className="h-3 w-3" />
                    {communityInfo.name}
                  </Link>
                  <Button
                    asChild
                    size="sm"
                    variant="outline"
                  >
                    <Link
                      href={`/communities/${communityInfo.slug}/books/${book.communityBookId}`}
                    >
                      <MessageSquareText className="h-4 w-4" />
                      View reflections
                    </Link>
                  </Button>
                </div>
              )}
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
            {!chapterOnlyMode && typeof book.totalPages === "number" && (
              <p>Total Pages: {book.totalPages}</p>
            )}
            <p>
              Tracking:{" "}
              {chapterOnlyMode
                ? "Chapter-only"
                : book.progressStyle === "chapters"
                  ? "Chapter-based"
                  : "Page-based"}
            </p>
            {book.progressStyle === "chapters" &&
              typeof book.totalChapters === "number" && (
                <p>Total Chapters: {book.totalChapters}</p>
              )}
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
            {book.buyLink && (
              <p>
                Buy the book:{" "}
                <a
                  href={book.buyLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline hover:no-underline"
                >
                  {book.buyLink}
                </a>
              </p>
            )}
          </div>
          {canEdit &&
            book.progressStyle === "chapters" &&
            book.totalChapters === undefined && (
              <p className="mt-2 text-sm text-muted-foreground">
                This is a legacy chapter-based book. Edit it to add total
                chapters and enable chapter dropdowns while logging.
              </p>
            )}
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
              <button
                type="button"
                onClick={() => setProgressSummaryOpen((open) => !open)}
                className="flex w-full items-center justify-between gap-3 text-left"
                aria-expanded={progressSummaryOpen}
              >
                <span className="text-lg font-semibold text-foreground">
                  Reading Progress Summary
                </span>
                <ChevronDown
                  className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                    progressSummaryOpen ? "rotate-180" : ""
                  }`}
                />
              </button>

              {progressSummaryOpen && (
                <div className="mt-4 space-y-2 border-t border-border pt-4">
                  {chapterMode && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Current Chapter:
                      </span>
                      <span className="font-medium text-foreground">
                        {progressSummary.currentChapter
                          ? `Chapter ${progressSummary.currentChapter}${
                              typeof book.totalChapters === "number"
                                ? ` / ${book.totalChapters}`
                                : ""
                            }`
                          : "Not logged yet"}
                      </span>
                    </div>
                  )}
                  {!progressSummary.isChapterOnly && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Pages Read:
                      </span>
                      <span className="font-medium text-foreground">
                        {progressSummary.totalPagesRead} /{" "}
                        {progressSummary.totalPages}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      Progress:
                    </span>
                    <span className="font-medium text-foreground">
                      {progressSummary.progressPercentage.toFixed(1)}%
                    </span>
                  </div>
                  {!isCommunityBook && (
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">
                        Expected by Today:
                      </span>
                      <span className="font-medium text-foreground">
                        {progressSummary.isChapterOnly
                          ? progressSummary.expectedChapterByToday !== undefined
                            ? `Chapter ${progressSummary.expectedChapterByToday}`
                            : "Not started yet"
                          : `Page ${progressSummary.expectedPageByToday}${
                              chapterMode &&
                              progressSummary.expectedChapterByToday !==
                                undefined
                                ? ` • Chapter ${progressSummary.expectedChapterByToday}`
                                : ""
                            }`}
                      </span>
                    </div>
                  )}
                  {!isCommunityBook && progressSummary.showExpectedDropdown && (
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
                              {item.label}:{" "}
                              {progressSummary.isChapterOnly
                                ? `Chapter ${item.expectedChapter}`
                                : `Page ${item.expectedPage}${
                                    chapterMode &&
                                    item.expectedChapter !== undefined
                                      ? ` • Chapter ${item.expectedChapter}`
                                      : ""
                                  }`}
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
                    difference={progressSummary.difference}
                    differenceUnit={progressSummary.differenceUnit}
                  />
                </div>
              )}
            </Card>
          )}
        </div>

        {(canEdit || isPublicBook) && (
          <Card className="mb-4 p-4 sm:mb-6">
            <button
              type="button"
              onClick={() => setReflectionsOpen((open) => !open)}
              className="flex w-full items-start justify-between gap-3 text-left"
              aria-expanded={reflectionsOpen}
            >
              <span>
                <span className="flex items-center gap-2 text-lg font-semibold text-foreground">
                  <BookOpenText className="h-5 w-5" />
                  Reflections
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">
                  {canEdit
                    ? isCommunityBook
                      ? "Your daily notes are shared with members of this community. You can also share the merged reflection publicly for this book."
                      : "Your daily notes are private. You can share the merged reflection publicly for this book."
                    : "Shared merged reflection from this reading journey."}
                </span>
              </span>
              <ChevronDown
                className={`mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                  reflectionsOpen ? "rotate-180" : ""
                }`}
              />
            </button>

            {reflectionsOpen && (
              <div className="mt-4 border-t border-border pt-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  {canEdit && (
                    <Button
                      type="button"
                      variant={
                        book.shareMergedReflection ? "secondary" : "outline"
                      }
                      size="sm"
                      disabled={shareReflectionPending || !book.isPublic}
                      onClick={() => {
                        if (!user?.id) return;
                        void setMergedReflectionSharing({
                          bookId,
                          userId: user.id,
                          shareMergedReflection: !book.shareMergedReflection,
                        });
                      }}
                      title={
                        book.isPublic
                          ? undefined
                          : "Make the book public before sharing merged reflections"
                      }
                    >
                      {book.shareMergedReflection
                        ? "Public reflection on"
                        : "Share merged note"}
                    </Button>
                  )}
                  {reflections.length > 0 && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={handleCopyReflections}
                      className="gap-1.5"
                    >
                      {copiedReflections ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                      {copiedReflections ? "Copied" : "Copy"}
                    </Button>
                  )}
                </div>

                {reflections.length > 0 ? (
                  <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    {canEdit && (
                      <div className="space-y-3">
                        <h4 className="text-sm font-medium text-foreground">
                          Daily Notes
                        </h4>
                        <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-border p-3">
                          {reflections.map((reflection) => (
                            <article
                              key={reflection._id}
                              className="border-b border-border pb-3 last:border-0 last:pb-0"
                            >
                              <div className="mb-1 text-xs font-medium text-muted-foreground">
                                {format(
                                  parseDateFromStorage(reflection.date),
                                  "MMMM d, yyyy"
                                )}
                              </div>
                              <p className="whitespace-pre-wrap text-sm text-foreground">
                                {reflection.reflectionNote}
                              </p>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="space-y-3">
                      <h4 className="text-sm font-medium text-foreground">
                        Merged Note
                      </h4>
                      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap rounded-md border border-border bg-muted p-3 font-sans text-sm leading-6 text-foreground">
                        {mergedReflectionText}
                      </pre>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {canEdit
                      ? "No reflection notes yet. Mark a day as read, then add a note from that day."
                      : "No shared reflection is available for this book."}
                  </div>
                )}

                {canEdit && staleReflections.length > 0 && (
                  <div className="mt-4 border-t border-border pt-4">
                    <button
                      type="button"
                      onClick={() => setStaleReflectionsOpen((open) => !open)}
                      className="flex w-full items-center justify-between gap-3 text-left"
                      aria-expanded={staleReflectionsOpen}
                    >
                      <span className="text-sm font-medium text-foreground">
                        Previous attempts ({staleReflections.length})
                      </span>
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                          staleReflectionsOpen ? "rotate-180" : ""
                        }`}
                      />
                    </button>

                    {staleReflectionsOpen && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          Notes from before this book was reset. These are
                          read-only.
                        </p>
                        <div className="max-h-80 space-y-3 overflow-y-auto rounded-md border border-border p-3 opacity-80">
                          {staleReflections.map((reflection) => (
                            <article
                              key={reflection._id}
                              className="border-b border-border pb-3 last:border-0 last:pb-0"
                            >
                              <div className="mb-1 text-xs font-medium text-muted-foreground">
                                {format(
                                  parseDateFromStorage(reflection.date),
                                  "MMMM d, yyyy"
                                )}
                              </div>
                              <p className="whitespace-pre-wrap text-sm text-foreground">
                                {reflection.reflectionNote}
                              </p>
                            </article>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

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

      <Dialog
        open={markCompleteOpen}
        onOpenChange={setMarkCompleteOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark this book as completed?</DialogTitle>
            <DialogDescription>
              This records the book as fully read without updating each day you
              tracked. Your existing session data is kept, but progress will
              show as 100% everywhere. You can still edit the book or log days
              below if you want.
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

      <Dialog
        open={clearMarkCompleteOpen}
        onOpenChange={setClearMarkCompleteOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove marked complete?</DialogTitle>
            <DialogDescription>
              Progress will go back to what your daily sessions show. You can
              mark the book completed again anytime.
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

      <Dialog
        open={resetOpen}
        onOpenChange={setResetOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset this book?</DialogTitle>
            <DialogDescription>
              Start reading this book over from scratch. Everything you&apos;ve
              tracked so far — read days, missed days, and reflections — is kept
              but archived: it turns read-only and appears greyed out in the
              calendar. Your progress resets to 0%. Next, you&apos;ll pick a new
              end date; the start date will be set to today.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={resetPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={resetPending || !user?.id}
              onClick={async () => {
                if (!user?.id) return;
                try {
                  await resetBook({
                    bookId,
                    userId: user.id,
                    startDate: formatDateForStorage(new Date()),
                  });
                  setResetOpen(false);
                  router.push(`/books/${bookId}/edit?reset=1`);
                } catch (e) {
                  console.error(e);
                }
              }}
            >
              {resetPending ? "Resetting…" : "Reset book"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
