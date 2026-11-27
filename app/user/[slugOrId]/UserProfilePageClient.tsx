"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import Link from "next/link";
import Image from "next/image";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import { useUser } from "@clerk/nextjs";
import {
  Calendar,
  Share2,
  Check,
  Tag,
  Flame,
  Settings as SettingsIcon,
} from "lucide-react";
import { format } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { normalizeTagKey } from "@/lib/bookTags";
import Navigation from "@/components/Navigation";
import PublicBookCard from "@/components/PublicBookCard";
import ReadingHeatmap from "@/components/ReadingHeatmap";
import ReadingPlan, { ReadingPlanPreview } from "@/components/ReadingPlan";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getStreaks } from "@/lib/readingActivity";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import BookCardSkeleton from "@/components/BookCardSkeleton";
import { ProfileSkeleton } from "@/components/CommunityCardSkeleton";
import { Button } from "@/components/ui/button";

type ProfileTab = "overview" | "books" | "plan";

const TAG_CHIP =
  "shrink-0 rounded-full border px-3 py-1.5 text-sm transition-colors";
const TAG_CHIP_ON = "border-primary bg-primary/10 font-medium text-primary";
const TAG_CHIP_OFF =
  "border-input bg-background text-muted-foreground hover:border-ring hover:text-foreground";

function StatItem({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-2 py-3 text-center sm:px-4">
      <p className="text-lg font-bold tabular-nums leading-tight text-foreground sm:text-xl">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}

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
    }),
    enabled: !!profileUser?.clerkId,
  });

  const { data: profileStats } = useQuery({
    ...convexQuery(api.books.getProfileStats, {
      profileUserId: profileUser?.clerkId ?? "",
    }),
    enabled: !!profileUser?.clerkId,
  });

  const { data: readingActivity } = useQuery({
    ...convexQuery(api.readingSessions.getReadingActivity, {
      profileUserId: profileUser?.clerkId ?? "",
    }),
    enabled: !!profileUser?.clerkId,
  });

  const { data: readingPlan } = useQuery({
    ...convexQuery(api.readingPlans.getReadingPlan, {
      profileUserId: profileUser?.clerkId ?? "",
    }),
    enabled: !!profileUser?.clerkId,
  });

  const isOwnProfile =
    !!profileUser?.clerkId && !!viewer?.id && viewer.id === profileUser.clerkId;

  // The active tab lives in the URL (?tab=books / ?tab=plan) so it survives a
  // refresh and can be shared. Overview is the default and keeps a clean URL.
  const router = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");
  const activeTab: ProfileTab =
    tabParam === "books" || tabParam === "plan" ? tabParam : "overview";
  const setActiveTab = (tab: ProfileTab) => {
    const next = new URLSearchParams(searchParams.toString());
    if (tab === "overview") next.delete("tab");
    else next.set("tab", tab);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };

  // Old links (and some shares) use the Clerk ID. Once we know the username,
  // swap the address bar to /user/<username> without a reload or new history
  // entry, keeping ?tab= and any other query.
  useEffect(() => {
    if (!profileUser?.slug || slugOrId === profileUser.slug) return;
    // The new URL remounts this page with a different lookup key. Seed the
    // cache under the username first so it renders the profile straight away
    // instead of flashing the loading skeleton.
    queryClient.setQueryData(
      convexQuery(api.users.getUserBySlugOrId, { slugOrId: profileUser.slug })
        .queryKey,
      profileUser
    );
    const query = searchParams.toString();
    router.replace(
      `/user/${profileUser.slug}${query ? `?${query}` : ""}`,
      { scroll: false }
    );
  }, [profileUser, slugOrId, searchParams, router, queryClient]);

  const streaks = useMemo(
    () => getStreaks(readingActivity ?? []),
    [readingActivity]
  );

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
          <ProfileSkeleton />
        </div>
      </>
    );
  }

  const displayName =
    profileUser.name || profileUser.email?.split("@")[0] || "Reader";

  const currentlyReading = books
    .filter(
      (book) =>
        !book.isArchived && (book.progress ?? 0) > 0 && (book.progress ?? 0) < 100
    )
    .sort((a, b) => (b.progress ?? 0) - (a.progress ?? 0))
    .slice(0, 4);
  const showPlanTab = isOwnProfile || (readingPlan?.length ?? 0) > 0;
  const showActivity = isOwnProfile || (readingActivity?.length ?? 0) > 0;
  // A shared ?tab=plan link for a profile with no public plan shows Overview.
  const currentTab: ProfileTab =
    activeTab === "plan" && !showPlanTab ? "overview" : activeTab;

  const openBooksForTag = (key: string) => {
    setSelectedTag(key);
    setActiveTab("books");
  };

  return (
    <>
      <Navigation />
      <div className="mx-auto max-w-6xl px-3 pb-8 pt-4 sm:px-6 sm:pt-6">
        {/* Hero */}
        <Card className="overflow-hidden">
          <div
            className="h-20 bg-gradient-to-r from-emerald-500/20 via-sky-500/15 to-violet-500/20 sm:h-24"
            aria-hidden="true"
          />
          <div className="px-4 pb-4 sm:px-6">
            <div className="-mt-10 flex items-end justify-between gap-3 sm:-mt-12">
              <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-full bg-muted ring-4 ring-card sm:h-24 sm:w-24">
                {profileUser.imageUrl ? (
                  <Image
                    src={profileUser.imageUrl}
                    alt={displayName}
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                    unoptimized
                  />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-2xl font-semibold uppercase text-foreground">
                    {displayName.charAt(0)}
                  </span>
                )}
              </div>
              <div className="flex gap-2 pb-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleShare}
                  className="gap-2 rounded-full"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Share2 className="h-4 w-4" />
                      <span className="hidden sm:inline">Share profile</span>
                      <span className="sm:hidden">Share</span>
                    </>
                  )}
                </Button>
                {isOwnProfile && (
                  <Button
                    variant="outline"
                    size="icon"
                    asChild
                    className="h-9 w-9 rounded-full"
                    aria-label="Settings"
                  >
                    <Link href="/dashboard/settings">
                      <SettingsIcon className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>
            </div>

            <div className="mt-3">
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                {displayName}
              </h1>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                {isOwnProfile && profileUser.email ? (
                  <span className="truncate">{profileUser.email}</span>
                ) : (
                  <span>Public reading tracker</span>
                )}
                {stats.readingSince && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5" />
                    Reading since {stats.readingSince}
                  </span>
                )}
                {streaks.current > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium text-orange-600 dark:text-orange-400">
                    <Flame className="h-3.5 w-3.5" />
                    {streaks.current}-day streak
                  </span>
                )}
              </div>
            </div>
          </div>

          {stats.totalBooks > 0 && (
            <div className="grid grid-cols-4 divide-x divide-border border-t border-border sm:grid-cols-5">
              <StatItem value={stats.totalBooks.toLocaleString()} label={stats.totalBooks === 1 ? "Book" : "Books"} />
              <StatItem value={stats.completed.toLocaleString()} label="Completed" />
              <StatItem value={stats.inProgress.toLocaleString()} label="Reading" />
              <StatItem
                value={stats.totalPagesRead.toLocaleString()}
                label="Pages read"
              />
              <div className="hidden sm:block">
                <StatItem value={`${stats.avgProgress}%`} label="Avg. progress" />
              </div>
            </div>
          )}
        </Card>

        <Tabs
          value={currentTab}
          onValueChange={(value) => setActiveTab(value as ProfileTab)}
          className="mt-4 sm:mt-6"
        >
          <div className="sticky top-14 z-30 -mx-3 border-b border-border bg-background/85 px-3 backdrop-blur-lg supports-[backdrop-filter]:bg-background/70 sm:top-16 sm:mx-0 sm:px-0">
            <TabsList className="h-auto w-full justify-start gap-1 rounded-none bg-transparent p-0 sm:w-auto">
              {(
                [
                  { value: "overview", label: "Overview" },
                  {
                    value: "books",
                    label: isOwnProfile ? "Books" : "Public books",
                    count: books.length,
                  },
                  ...(showPlanTab
                    ? [{ value: "plan", label: "Plan", count: readingPlan?.length }]
                    : []),
                ] as { value: ProfileTab; label: string; count?: number }[]
              ).map((tab) => (
                <TabsTrigger
                  key={tab.value}
                  value={tab.value}
                  className="relative flex-1 gap-1.5 rounded-none px-3 py-3 text-muted-foreground shadow-none after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground after:opacity-0 after:transition-opacity data-[state=active]:bg-transparent data-[state=active]:text-foreground data-[state=active]:shadow-none data-[state=active]:after:opacity-100 sm:flex-none sm:px-4"
                >
                  {tab.label}
                  {tab.count ? (
                    <span className="rounded-full bg-muted px-1.5 text-[11px] tabular-nums text-muted-foreground">
                      {tab.count}
                    </span>
                  ) : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          {/* Overview */}
          <TabsContent value="overview" className="mt-5 space-y-5 sm:mt-6">
            {showActivity && (
              <ReadingHeatmap
                activity={readingActivity}
                isOwnProfile={isOwnProfile}
              />
            )}

            <div className="grid gap-4 lg:grid-cols-2">
              <Card className="flex flex-col p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h3 className="text-base font-semibold text-foreground">
                    Currently reading
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab("books")}
                    className="text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    All books →
                  </button>
                </div>
                {booksPending ? (
                  <div className="space-y-2">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div key={index} className="h-12 animate-pulse rounded-md bg-muted" />
                    ))}
                  </div>
                ) : currentlyReading.length === 0 ? (
                  <p className="flex flex-1 items-center rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                    {isOwnProfile
                      ? "Nothing in progress right now. Start a book from your dashboard or your plan."
                      : "Nothing in progress right now."}
                  </p>
                ) : (
                  <ul className="divide-y divide-border">
                    {currentlyReading.map((book) => (
                      <li key={book._id}>
                        <Link
                          href={`/books/${book._id}`}
                          className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-muted/60"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-foreground">
                              {book.name}
                            </p>
                            {book.author && (
                              <p className="truncate text-xs text-muted-foreground">
                                {book.author}
                              </p>
                            )}
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-blue-500"
                                style={{ width: `${Math.round(book.progress ?? 0)}%` }}
                              />
                            </div>
                          </div>
                          <span className="w-10 shrink-0 text-right text-xs font-medium tabular-nums text-muted-foreground">
                            {Math.round(book.progress ?? 0)}%
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>

              <ReadingPlanPreview
                profileUserId={profileUser.clerkId}
                isOwnProfile={isOwnProfile}
                onOpenPlan={() => setActiveTab("plan")}
              />
            </div>

            {tagGroups.length > 0 && (
              <Card className="p-4 sm:p-5">
                <h3 className="mb-3 flex items-center gap-2 text-base font-semibold text-foreground">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  By topic
                </h3>
                <div className="flex flex-wrap gap-2">
                  {tagGroups.map((group) => (
                    <button
                      key={group.key}
                      type="button"
                      onClick={() => openBooksForTag(group.key)}
                      className={cn(TAG_CHIP, TAG_CHIP_OFF)}
                    >
                      {group.label}{" "}
                      <span className="text-muted-foreground">
                        {group.read}/{group.total} read
                      </span>
                    </button>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          {/* Books */}
          <TabsContent value="books" className="mt-5 sm:mt-6">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              {tagGroups.length > 0 ? (
                <div className="-mx-3 flex gap-2 overflow-x-auto px-3 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden">
                  <button
                    type="button"
                    onClick={() => setSelectedTag(null)}
                    className={cn(TAG_CHIP, selectedTag === null ? TAG_CHIP_ON : TAG_CHIP_OFF)}
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
                      className={cn(
                        TAG_CHIP,
                        selectedTag === group.key ? TAG_CHIP_ON : TAG_CHIP_OFF
                      )}
                    >
                      {group.label}{" "}
                      <span className="text-muted-foreground">
                        {group.read}/{group.total}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <span />
              )}
              {monthOptions.length > 0 && (
                <Select
                  value={selectedMonth ?? "all"}
                  onValueChange={(value) =>
                    setSelectedMonth(value === "all" ? null : value)
                  }
                >
                  <SelectTrigger className="h-9 w-full shrink-0 sm:w-[190px]">
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
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
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
              <div className="grid grid-cols-1 gap-4 sm:gap-6 md:grid-cols-2 lg:grid-cols-3">
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
          </TabsContent>

          {/* Plan */}
          {showPlanTab && (
            <TabsContent value="plan" className="mt-5 sm:mt-6">
              <ReadingPlan
                profileUserId={profileUser.clerkId}
                isOwnProfile={isOwnProfile}
              />
            </TabsContent>
          )}
        </Tabs>
      </div>
    </>
  );
}
