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
} from "lucide-react";
import { format } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { isChapterOnlyBook } from "@/lib/chapterTracking";
import Navigation from "@/components/Navigation";
import PublicBookCard from "@/components/PublicBookCard";
import { Card } from "@/components/ui/card";
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

  const isOwnProfile =
    !!profileUser?.clerkId && !!viewer?.id && viewer.id === profileUser.clerkId;

  const stats = useMemo(() => {
    if (!books.length) {
      return {
        totalBooks: 0,
        completed: 0,
        inProgress: 0,
        totalPagesRead: 0,
        readingSince: null as string | null,
        avgProgress: 0,
      };
    }
    const completed = books.filter(
      (b: { progress?: number }) => (b.progress ?? 0) >= 100
    ).length;
    const inProgress = books.filter((b: { progress?: number }) => {
      const p = b.progress ?? 0;
      return p > 0 && p < 100;
    }).length;
    const totalPagesRead = Math.round(
      books.reduce(
        (
          sum: number,
          b: {
            totalPages?: number;
            progress?: number;
            progressStyle?: "pages" | "chapters";
            ignorePages?: boolean;
          }
        ) =>
          isChapterOnlyBook(b)
            ? sum
            : sum + ((b.totalPages ?? 0) * (b.progress ?? 0)) / 100,
        0
      )
    );
    const earliestStart = books.reduce(
      (min: string | null, b: { startDate: string }) =>
        !min || b.startDate < min ? b.startDate : min,
      null as string | null
    );
    const readingSince = earliestStart
      ? format(parseDateFromStorage(earliestStart), "MMM yyyy")
      : null;
    const avgProgress =
      books.reduce(
        (sum: number, b: { progress?: number }) => sum + (b.progress ?? 0),
        0
      ) / books.length;

    return {
      totalBooks: books.length,
      completed,
      inProgress,
      totalPagesRead,
      readingSince,
      avgProgress: Math.round(avgProgress),
    };
  }, [books]);

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
          <div className="flex min-h-[400px] items-center justify-center">
            <p className="text-muted-foreground">Loading profile...</p>
          </div>
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

        {!booksPending && books.length > 0 && (
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

        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {isOwnProfile ? "Books" : "Public books"}
        </h2>

        {booksPending ? (
          <div className="flex min-h-[200px] items-center justify-center">
            <p className="text-muted-foreground">Loading books...</p>
          </div>
        ) : books.length === 0 ? (
          <Card className="p-8 text-center">
            <p className="text-muted-foreground">
              {isOwnProfile ? "No books yet." : "No public books yet."}
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {books.map((book) => (
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
