"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import BookCard from "@/components/BookCard";
import BookCardSkeleton from "@/components/BookCardSkeleton";
import ArchivedBookCard from "@/components/ArchivedBookCard";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BookOpen, Flame, Plus } from "lucide-react";
import { addDays, differenceInCalendarDays, format, startOfDay } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { getStreaks } from "@/lib/readingActivity";
import { cn } from "@/lib/utils";

type TabType = "active" | "archived";
type StatusFilter = "all" | "reading" | "not-started" | "finished";

function statusOf(progress: number): Exclude<StatusFilter, "all"> {
  if (progress >= 100) return "finished";
  if (progress > 0) return "reading";
  return "not-started";
}

/** Where today falls in a book's reading window, or null if outside it. */
function dayInWindow(book: { startDate: string; endDate: string }) {
  const start = parseDateFromStorage(book.startDate);
  const end = parseDateFromStorage(book.endDate);
  const today = startOfDay(new Date());
  if (today < start || today > end) return null;
  return {
    day: differenceInCalendarDays(today, start) + 1,
    total: differenceInCalendarDays(end, start) + 1,
    daysLeft: differenceInCalendarDays(end, today),
  };
}

function SnapshotStat({
  value,
  label,
  icon,
}: {
  value: string;
  label: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="px-2 py-3 text-center sm:px-4">
      <p className="flex items-center justify-center gap-1 text-lg font-bold tabular-nums leading-tight text-foreground sm:text-xl">
        {icon}
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground sm:text-xs">
        {label}
      </p>
    </div>
  );
}

function getGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

type DashboardBook = {
  _id: Id<"books">;
  name: string;
  author?: string;
  totalPages?: number;
  totalChapters?: number;
  readingMode: "calendar" | "fixed-days";
  startDate: string;
  endDate: string;
  startMonth?: string;
  endMonth?: string;
  startYear?: number;
  endYear?: number;
  daysToRead?: number;
  isPublic?: boolean;
  progressStyle?: "pages" | "chapters";
  ignorePages?: boolean;
  progress?: number;
};

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>("active");

  const { data: books, isPending: booksPending } = useQuery({
    ...convexQuery(api.books.getBooks, {}),
    enabled: isLoaded && !!user?.id && activeTab === "active",
  });

  const { data: archivedBooks, isPending: archivedPending } = useQuery({
    ...convexQuery(api.books.getArchivedBooks, {}),
    enabled: isLoaded && !!user?.id && activeTab === "archived",
  });


  const { data: activity } = useQuery({
    ...convexQuery(api.readingSessions.getReadingActivity, {
      profileUserId: user?.id ?? "",
    }),
    enabled: isLoaded && !!user?.id,
  });

  // Finished books are usually archived, so count them across ALL books
  // (getProfileStats includes archived ones), not just the active list.
  const { data: profileStats } = useQuery({
    ...convexQuery(api.books.getProfileStats, {
      profileUserId: user?.id ?? "",
    }),
    enabled: isLoaded && !!user?.id,
  });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const isPending = activeTab === "active" ? booksPending : archivedPending;
  const listBooks = useMemo(
    () =>
      ((activeTab === "active" ? books : archivedBooks) ??
        []) as DashboardBook[],
    [activeTab, books, archivedBooks]
  );
  const activeBooks = useMemo(
    () => (books ?? []) as DashboardBook[],
    [books]
  );

  // Books whose reading window includes today and that aren't finished yet.
  const continueReading = useMemo(
    () =>
      activeBooks
        .map((book) => ({ book, window: dayInWindow(book) }))
        .filter(
          (entry): entry is { book: DashboardBook; window: NonNullable<ReturnType<typeof dayInWindow>> } =>
            entry.window !== null && (entry.book.progress ?? 0) < 100
        )
        .sort((a, b) => a.window.daysLeft - b.window.daysLeft),
    [activeBooks]
  );

  const snapshot = useMemo(() => {
    const weekStart = format(addDays(new Date(), -6), "yyyy-MM-dd");
    const pagesThisWeek = (activity ?? [])
      .filter((day) => day.date >= weekStart)
      .reduce((sum, day) => sum + day.pages, 0);
    return {
      streak: getStreaks(activity ?? []).current,
      pagesThisWeek,
      readingNow: continueReading.length,
      finished:
        profileStats?.completed ??
        activeBooks.filter((book) => (book.progress ?? 0) >= 100).length,
    };
  }, [activity, activeBooks, continueReading.length, profileStats]);

  const statusCounts = useMemo(() => {
    const counts = { all: listBooks.length, reading: 0, "not-started": 0, finished: 0 };
    for (const book of listBooks) counts[statusOf(book.progress ?? 0)] += 1;
    return counts;
  }, [listBooks]);

  const booksWithProgress =
    statusFilter === "all"
      ? listBooks
      : listBooks.filter(
          (book) => statusOf(book.progress ?? 0) === statusFilter
        );

  let content = null;
  if (isPending && books === undefined) {
    content = (
      <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <BookCardSkeleton key={index} />
        ))}
      </div>
    );
  } else {
    content = (
      <div>
        {booksWithProgress.length === 0 && listBooks.length > 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No books match this filter.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => setStatusFilter("all")}
            >
              Show all books
            </Button>
          </Card>
        ) : booksWithProgress.length === 0 ? (
          <Card className="p-6 text-center sm:p-12">
            <p className="mb-4 text-sm text-muted-foreground sm:text-lg">
              {activeTab === "active"
                ? "No active books yet. Add your first book to get started!"
                : "No archived books yet."}
            </p>
            {activeTab === "active" && (
              <Button asChild>
                <Link href="/books/new">Add Book</Link>
              </Button>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {booksWithProgress.map((book) =>
              activeTab === "archived" ? (
                <ArchivedBookCard
                  key={book._id}
                  book={book}
                  progress={book.progress || 0}
                />
              ) : (
                <BookCard
                  key={book._id}
                  book={book}
                  progress={book.progress || 0}
                />
              )
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <>
      <Navigation />
      <div className="mx-auto max-w-6xl px-3 pb-8 pt-4 sm:px-6 sm:pt-6">
        <div className="mb-5 flex items-end justify-between gap-4 sm:mb-6">
          <div>
            {user?.firstName && (
              <p className="mb-1 text-sm font-medium text-muted-foreground">
                {getGreeting()}, {user.firstName}
              </p>
            )}
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
              My Books
            </h1>
          </div>
          {/* Mobile adds books from the tab bar's + button. */}
          <Button asChild className="hidden shrink-0 md:inline-flex">
            <Link href="/books/new">
              <Plus className="h-4 w-4" />
              Add New Book
            </Link>
          </Button>
        </div>

        {/* Reading snapshot */}
        {activeBooks.length > 0 && (
          <Card className="mb-6 grid grid-cols-4 divide-x divide-border">
            <SnapshotStat
              value={snapshot.streak.toLocaleString()}
              label="Day streak"
              icon={
                snapshot.streak > 0 ? (
                  <Flame className="h-4 w-4 text-orange-500" />
                ) : undefined
              }
            />
            <SnapshotStat
              value={snapshot.readingNow.toLocaleString()}
              label="Reading now"
            />
            <SnapshotStat
              value={snapshot.pagesThisWeek.toLocaleString()}
              label="Pages this week"
            />
            <SnapshotStat
              value={snapshot.finished.toLocaleString()}
              label="Finished"
            />
          </Card>
        )}

        {/* Continue reading: books scheduled for today */}
        {continueReading.length > 0 && (
          <section className="mb-8" aria-labelledby="continue-reading-heading">
            <div className="mb-3 flex items-baseline justify-between gap-2">
              <h2
                id="continue-reading-heading"
                className="text-lg font-semibold text-foreground"
              >
                Continue reading
              </h2>
              <span className="text-xs text-muted-foreground">
                {`${continueReading.length} on today's schedule`}
              </span>
            </div>
            <div className="-mx-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-3 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3 [&::-webkit-scrollbar]:hidden">
              {continueReading.slice(0, 3).map(({ book, window }) => {
                const progress = Math.min(100, Math.round(book.progress ?? 0));
                return (
                  <Card
                    key={book._id}
                    className="flex w-[82%] shrink-0 snap-start flex-col p-4 sm:w-auto"
                  >
                    <div className="flex items-start gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-foreground">
                          {book.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Day {window.day} of {window.total}
                          {window.daysLeft > 0
                            ? ` · ${window.daysLeft} day${window.daysLeft === 1 ? "" : "s"} left`
                            : " · last day"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <span className="w-9 text-right text-xs tabular-nums text-muted-foreground">
                        {progress}%
                      </span>
                    </div>
                    <Button asChild size="sm" className="mt-3 w-full">
                      <Link href={`/books/${book._id}`}>Log today&apos;s reading</Link>
                    </Button>
                  </Card>
                );
              })}
            </div>
          </section>
        )}

        <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={activeTab}
            onValueChange={(value: string) => {
              setActiveTab(value as TabType);
              setStatusFilter("all");
            }}
            className="w-full sm:w-auto"
          >
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger value="active" className="flex-1 sm:flex-none">
                Active
              </TabsTrigger>
              <TabsTrigger value="archived" className="flex-1 sm:flex-none">
                Archived
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {listBooks.length > 0 && (
            <div
              role="radiogroup"
              aria-label="Filter books by status"
              className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {(
                [
                  { value: "all", label: "All" },
                  { value: "reading", label: "In progress" },
                  { value: "not-started", label: "Not started" },
                  { value: "finished", label: "Finished" },
                ] as { value: StatusFilter; label: string }[]
              ).map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  role="radio"
                  aria-checked={statusFilter === filter.value}
                  onClick={() => setStatusFilter(filter.value)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    statusFilter === filter.value
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {filter.label}
                  <span className="ml-1 tabular-nums opacity-70">
                    {statusCounts[filter.value]}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {content}
      </div>
    </>
  );
}
