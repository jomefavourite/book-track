"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import Image from "next/image";
import { useParams } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  BookOpen,
  CheckCircle2,
  BookMarked,
  FileText,
  Calendar,
  Sparkles,
  Share2,
  Check,
  Tag,
} from "lucide-react";
import { format } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { normalizeTagKey } from "@/lib/bookTags";
import Navigation from "@/components/Navigation";
import PublicBookCard from "@/components/PublicBookCard";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BookCardSkeleton from "@/components/BookCardSkeleton";
import { DetailPageSkeleton } from "@/components/CommunityCardSkeleton";
import { Button } from "@/components/ui/button";

export default function UserProfilePage() {
  const params = useParams();
  const { user: viewer } = useUser();
  const slugOrId = (params?.slugOrId as string) ?? "";

  const { data: profileUser, isPending: userPending } = useQuery({
    ...convexQuery(api.users.getUserBySlugOrId, { slugOrId }),
    enabled: !!slugOrId,
  });

  const { data: books = [], isPending: booksPending } = useQuery({
    ...convexQuery(api.books.getBooksForProfile, {
      profileUserId: profileUser?.clerkId ?? "",
      viewerUserId: viewer?.id ?? undefined,
    }),
    enabled: !!profileUser?.clerkId,
  });

  const { data: profileStats } = useQuery({
    ...convexQuery(api.books.getProfileStats, {
      profileUserId: profileUser?.clerkId ?? "",
    }),
    enabled: !!profileUser?.clerkId,
  });

  const isOwnProfile =
    !!profileUser?.clerkId && !!viewer?.id && viewer.id === profileUser.clerkId;

  const stats = useMemo(() => {
    if (!profileStats) {
      return {
        totalBooks: 0,
        completed: 0,
        inProgress: 0,
        totalPagesRead: 0,
        readingSince: null as string | null,
        avgProgress: 0,
      };
    }
    const readingSince = profileStats.earliestStartDate
      ? format(parseDateFromStorage(profileStats.earliestStartDate), "MMM yyyy")
      : null;

    return {
      totalBooks: profileStats.totalBooks,
      completed: profileStats.completed,
      inProgress: profileStats.inProgress,
      totalPagesRead: profileStats.totalPagesRead,
      readingSince,
      avgProgress: profileStats.avgProgress,
    };
  }, [profileStats]);

  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  // All 12 months of every year the library spans (from the earliest reading
  // year to the latest), newest first. Full years so no month is skipped, and
  // multiple years are handled when reading ranges cross a year boundary.
  const monthOptions = useMemo(() => {
    if (books.length === 0) return [];
    let minYear = Infinity;
    let maxYear = -Infinity;
    for (const book of books) {
      const startYear = parseDateFromStorage(book.startDate).getFullYear();
      const endYear = parseDateFromStorage(book.endDate).getFullYear();
      minYear = Math.min(minYear, startYear, endYear);
      maxYear = Math.max(maxYear, startYear, endYear);
    }
    if (!Number.isFinite(minYear) || !Number.isFinite(maxYear)) return [];

    const options: { key: string; label: string }[] = [];
    for (let year = maxYear; year >= minYear; year--) {
      for (let month = 11; month >= 0; month--) {
        const date = new Date(year, month, 1);
        options.push({
          key: format(date, "yyyy-MM"),
          label: format(date, "MMMM yyyy"),
        });
      }
    }
    return options;
  }, [books]);

  // Group the visible books by tag with read (completed) / total counts.
  const tagGroups = useMemo(() => {
    const map = new Map<
      string,
      { key: string; label: string; total: number; read: number }
    >();
    for (const book of books) {
      const seenInBook = new Set<string>();
      for (const tag of book.tags ?? []) {
        const key = normalizeTagKey(tag);
        if (!key || seenInBook.has(key)) continue;
        seenInBook.add(key);
        const existing = map.get(key) ?? {
          key,
          label: tag,
          total: 0,
          read: 0,
        };
        existing.total += 1;
        if ((book.progress ?? 0) >= 100) existing.read += 1;
        map.set(key, existing);
      }
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }, [books]);

  // Apply the tag and month filters together (a book must match both).
  // A book counts for a month if its reading range overlaps that month.
  const visibleBooks = useMemo(
    () =>
      books.filter((book) => {
        if (
          selectedTag &&
          !(book.tags ?? []).some(
            (tag) => normalizeTagKey(tag) === selectedTag
          )
        ) {
          return false;
        }
        if (selectedMonth) {
          const startKey = format(
            parseDateFromStorage(book.startDate),
            "yyyy-MM"
          );
          const endKey = format(parseDateFromStorage(book.endDate), "yyyy-MM");
          if (!(startKey <= selectedMonth && selectedMonth <= endKey)) {
            return false;
          }
        }
        return true;
      }),
    [books, selectedTag, selectedMonth]
  );

  const [copied, setCopied] = useState(false);

  const handleShare = async () => {
    const url =
      typeof window !== "undefined" && profileUser
        ? `${window.location.origin}/user/${profileUser.slug ?? slugOrId}`
        : "";
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = url;
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } finally {
        document.body.removeChild(textArea);
      }
    }
  };

  const isPending = userPending;
  const notFound = !userPending && slugOrId && !profileUser;

  if (!slugOrId) {
    return (
      <>
        <Navigation />
        <div className="mx-auto max-w-6xl p-6">
          <p className="text-muted-foreground">Invalid profile URL.</p>
        </div>
      </>
    );
  }

  if (notFound) {
    return (
      <>
        <Navigation />
        <div className="mx-auto max-w-6xl p-6">
          <Card className="p-12 text-center">
            <h1 className="mb-2 text-xl font-semibold text-foreground">
              User not found
            </h1>
            <p className="mb-4 text-muted-foreground">
              This profile doesn&apos;t exist or hasn&apos;t been set up yet.
            </p>
            <Button
              asChild
              variant="outline"
            >
              <Link href="/public">Browse public books</Link>
            </Button>
          </Card>
        </div>
      </>
    );
  }

  if (isPending || !profileUser) {
    return (
      <>
        <Navigation />
        <div className="mx-auto max-w-6xl p-6">
          <DetailPageSkeleton />
        </div>
      </>
    );
  }

  const displayName =
    profileUser.name || profileUser.email?.split("@")[0] || "Reader";

  return (
    <>
      <Navigation />
      <div className="mx-auto max-w-6xl p-6">
        <Card className="mb-8 p-6 sm:p-8">
          <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              {profileUser.imageUrl && (
                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted">
                  <Image
                    src={profileUser.imageUrl}
                    alt={displayName}
                    width={80}
                    height={80}
                    className="object-cover"
                    unoptimized
                  />
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                  {displayName}
                </h1>
                {isOwnProfile && profileUser.email && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {profileUser.email}
                  </p>
                )}
                {!isOwnProfile && (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Public Reading Tracker
                  </p>
                )}
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleShare}
              className="shrink-0 gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Share2 className="h-4 w-4" />
                  Share profile
                </>
              )}
            </Button>
          </div>
        </Card>

        {stats.totalBooks > 0 && (
          <div className="mb-8">
            <h2 className="mb-4 text-sm font-medium text-muted-foreground">
              Reading stats
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Card className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="rounded-full bg-primary/10 p-2">
                  <BookOpen className="h-5 w-5 text-primary" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {stats.totalBooks}
                </span>
                <span className="text-xs text-muted-foreground">
                  {stats.totalBooks === 1 ? "Book" : "Books"}
                </span>
              </Card>
              <Card className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="rounded-full bg-green-500/10 p-2">
                  <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {stats.completed}
                </span>
                <span className="text-xs text-muted-foreground">Completed</span>
              </Card>
              <Card className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="rounded-full bg-amber-500/10 p-2">
                  <BookMarked className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {stats.inProgress}
                </span>
                <span className="text-xs text-muted-foreground">
                  In progress
                </span>
              </Card>
              {stats.totalPagesRead > 0 && (
                <Card className="flex flex-col items-center gap-2 p-4 text-center">
                  <div className="rounded-full bg-blue-500/10 p-2">
                    <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="text-2xl font-bold tabular-nums text-foreground">
                    {stats.totalPagesRead.toLocaleString()}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Pages read
                  </span>
                </Card>
              )}
              <Card className="flex flex-col items-center gap-2 p-4 text-center">
                <div className="rounded-full bg-violet-500/10 p-2">
                  <Sparkles className="h-5 w-5 text-violet-600 dark:text-violet-400" />
                </div>
                <span className="text-2xl font-bold tabular-nums text-foreground">
                  {stats.avgProgress}%
                </span>
                <span className="text-xs text-muted-foreground">
                  Avg. progress
                </span>
              </Card>
              {stats.readingSince && (
                <Card className="flex flex-col items-center gap-2 p-4 text-center">
                  <div className="rounded-full bg-rose-500/10 p-2">
                    <Calendar className="h-5 w-5 text-rose-600 dark:text-rose-400" />
                  </div>
                  <span className="text-lg font-bold text-foreground">
                    {stats.readingSince}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Reading since
                  </span>
                </Card>
              )}
            </div>
          </div>
        )}

        {tagGroups.length > 0 && (
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-2">
              <Tag className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold text-foreground">By topic</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedTag(null)}
                className={
                  selectedTag === null
                    ? "rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                    : "rounded-full border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-ring hover:text-foreground"
                }
              >
                All ({books.length})
              </button>
              {tagGroups.map((group) => (
                <button
                  key={group.key}
                  type="button"
                  onClick={() =>
                    setSelectedTag((current) =>
                      current === group.key ? null : group.key
                    )
                  }
                  className={
                    selectedTag === group.key
                      ? "rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
                      : "rounded-full border border-input bg-background px-3 py-1.5 text-sm text-muted-foreground hover:border-ring hover:text-foreground"
                  }
                >
                  {group.label}{" "}
                  <span className="text-muted-foreground">
                    {group.read}/{group.total} read
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-foreground">
            {isOwnProfile ? "Books" : "Public books"}
          </h2>
          {monthOptions.length > 0 && (
            <Select
              value={selectedMonth ?? "all"}
              onValueChange={(value) =>
                setSelectedMonth(value === "all" ? null : value)
              }
            >
              <SelectTrigger className="h-9 w-[190px]">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <SelectValue placeholder="Filter by month" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All months</SelectItem>
                {monthOptions.map((month) => (
                  <SelectItem key={month.key} value={month.key}>
                    {month.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {booksPending ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, index) => (
              <BookCardSkeleton key={index} />
            ))}
          </div>
        ) : books.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              {isOwnProfile ? "No books yet." : "No public books yet."}
            </p>
          </Card>
        ) : visibleBooks.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              No books match the selected filters.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {visibleBooks.map((book) => (
              <PublicBookCard
                key={book._id}
                book={book}
                progress={book.progress ?? 0}
                showVisibilityBadge={isOwnProfile}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
