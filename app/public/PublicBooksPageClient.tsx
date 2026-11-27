"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { SignInButton, useUser } from "@clerk/nextjs";
import { Compass, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import BookCardSkeleton from "@/components/BookCardSkeleton";
import PublicBookCard from "@/components/PublicBookCard";
import Navigation from "@/components/Navigation";
import { cn } from "@/lib/utils";

type StatusFilter = "all" | "reading" | "finished" | "not-started";

function statusOf(progress: number): Exclude<StatusFilter, "all"> {
  if (progress >= 100) return "finished";
  if (progress > 0) return "reading";
  return "not-started";
}

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-2 py-3 text-center sm:px-4">
      <p className="text-lg font-bold tabular-nums leading-tight text-foreground sm:text-xl">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">
        {label}
      </p>
    </div>
  );
}

export default function PublicBooksPage() {
  const { isSignedIn } = useUser();
  const { data: books, isPending } = useQuery({
    ...convexQuery(api.books.getPublicBooks, {}),
    enabled: true,
  });

  const { data: stats, isPending: statsPending } = useQuery({
    ...convexQuery(api.books.getPublicBooksStats, {}),
    enabled: true,
  });

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");

  const allBooks = useMemo(() => books ?? [], [books]);

  const counts = useMemo(() => {
    const result = { all: allBooks.length, reading: 0, finished: 0, "not-started": 0 };
    for (const book of allBooks) result[statusOf(book.progress ?? 0)] += 1;
    return result;
  }, [allBooks]);

  const visibleBooks = useMemo(() => {
    const query = search.trim().toLowerCase();
    return allBooks.filter((book) => {
      if (status !== "all" && statusOf(book.progress ?? 0) !== status) {
        return false;
      }
      if (!query) return true;
      return [book.name, book.author, book.creatorName, ...(book.tags ?? [])]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [allBooks, search, status]);

  const filters: { value: StatusFilter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "reading", label: "Reading" },
    { value: "finished", label: "Finished" },
    { value: "not-started", label: "Not started" },
  ];

  return (
    <>
      <Navigation />
      <div className="mx-auto max-w-6xl px-3 pb-8 pt-4 sm:px-6 sm:pt-6">
        <div className="mb-5 sm:mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
            <Compass className="h-6 w-6 text-muted-foreground sm:h-8 sm:w-8" />
            Discover
          </h1>
          <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">
            See what other readers are tracking and find your next book.
          </p>
        </div>

        {/* Community stats as one strip, like the profile header. */}
        {statsPending ? (
          <Card className="mb-6 grid grid-cols-3 divide-x divide-border sm:grid-cols-5">
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className={cn(
                  "flex flex-col items-center gap-1.5 py-3",
                  index > 2 && "hidden sm:flex"
                )}
              >
                <Skeleton className="h-5 w-10" />
                <Skeleton className="h-3 w-14" />
              </div>
            ))}
          </Card>
        ) : (
          stats &&
          stats.totalBooks > 0 && (
            <Card className="mb-6 grid grid-cols-3 divide-x divide-border sm:grid-cols-5">
              <StatItem
                value={stats.totalBooks.toLocaleString()}
                label={stats.totalBooks === 1 ? "Public book" : "Public books"}
              />
              <StatItem value={stats.inProgress.toLocaleString()} label="Reading" />
              <StatItem value={stats.completed.toLocaleString()} label="Finished" />
              <div className="hidden sm:block">
                <StatItem
                  value={stats.notStarted.toLocaleString()}
                  label="Not started"
                />
              </div>
              <div className="hidden sm:block">
                <StatItem
                  value={stats.totalPagesRead.toLocaleString()}
                  label="Pages read"
                />
              </div>
            </Card>
          )
        )}

        {/* Search + status filters */}
        {(isPending || allBooks.length > 0) && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search books, authors, readers…"
                aria-label="Search public books"
                className="h-10 w-full rounded-full border border-input bg-background pl-9 pr-9 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 [&::-webkit-search-cancel-button]:hidden"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <div
              role="radiogroup"
              aria-label="Filter by status"
              className="-mx-3 flex gap-1.5 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {filters.map((filter) => (
                <button
                  key={filter.value}
                  type="button"
                  role="radio"
                  aria-checked={status === filter.value}
                  onClick={() => setStatus(filter.value)}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    status === filter.value
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {filter.label}
                  {!isPending && (
                    <span className="ml-1 tabular-nums opacity-70">
                      {counts[filter.value]}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {isPending ? (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <BookCardSkeleton key={index} />
            ))}
          </div>
        ) : allBooks.length === 0 ? (
          <Card className="flex flex-col items-center p-8 text-center sm:p-12">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Compass className="h-6 w-6 text-muted-foreground" />
            </span>
            <p className="mt-3 text-base font-semibold text-foreground">
              No public books yet
            </p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Be the first to share your reading journey.
            </p>
            {!isSignedIn && (
              <SignInButton mode="modal">
                <Button className="mt-4">Sign in to create a book</Button>
              </SignInButton>
            )}
          </Card>
        ) : visibleBooks.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No books match your search.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => {
                setSearch("");
                setStatus("all");
              }}
            >
              Clear filters
            </Button>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visibleBooks.map((book) => (
              <PublicBookCard
                key={book._id}
                book={book}
                progress={book.progress || 0}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
