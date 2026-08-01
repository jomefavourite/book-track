"use client";

import { useState } from "react";
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
import { BookOpen, Lock, Search, ShieldCheck, Users } from "lucide-react";
import { getBrandTheme } from "@/lib/brandColor";

type TabType = "active" | "archived";

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

type CommunityPreview = {
  _id: string;
  name: string;
  slug: string;
  visibility: "public" | "private";
  memberCount: number;
  viewerRole?: "owner" | "admin" | "moderator" | "member";
  brandColor?: string;
  logoUrl?: string | null;
  activeBook?: {
    _id: Id<"communityBooks">;
    name: string;
    trackedBookId?: Id<"books"> | null;
  } | null;
};

function CommunityLogo({
  name,
  logoUrl,
  brandColor,
}: {
  name: string;
  logoUrl?: string | null;
  brandColor?: string;
}) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={logoUrl}
        alt={`${name} logo`}
        className="h-12 w-12 shrink-0 rounded-lg border border-border object-cover"
      />
    );
  }
  const brandTheme = getBrandTheme(brandColor);
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border text-lg font-semibold uppercase text-foreground"
      style={
        brandTheme
          ? {
              backgroundColor: brandTheme.brand,
              color: brandTheme.brandForeground,
            }
          : undefined
      }
      aria-hidden="true"
    >
      {name.charAt(0)}
    </span>
  );
}

function VisibilityBadge({
  visibility,
}: {
  visibility: "public" | "private";
}) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
      {visibility === "private" ? (
        <Lock className="h-3 w-3" />
      ) : (
        <Search className="h-3 w-3" />
      )}
      {visibility}
    </span>
  );
}

function getActiveBookHref(community: CommunityPreview) {
  if (!community.activeBook) return null;
  if (community.activeBook.trackedBookId) {
    return `/books/${community.activeBook.trackedBookId}`;
  }
  return `/communities/${community.slug}/books/${community.activeBook._id}`;
}

function CommunityDashboardCard({
  community,
}: {
  community: CommunityPreview;
}) {
  const activeBookHref = getActiveBookHref(community);
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-center gap-3">
        <CommunityLogo
          name={community.name}
          logoUrl={community.logoUrl}
          brandColor={community.brandColor}
        />
        <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-card-foreground sm:text-lg">
          {community.name}
        </h3>
      </div>

      <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
        <VisibilityBadge visibility={community.visibility} />
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4" />
          <span>
            {community.memberCount.toLocaleString()}{" "}
            {community.memberCount === 1 ? "member" : "members"}
          </span>
        </div>
        {community.viewerRole && (
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            <span className="capitalize">
              Your role: {community.viewerRole}
            </span>
          </div>
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          asChild
          size="sm"
          className="flex-1"
        >
          <Link href={`/communities/${community.slug}`}>Open</Link>
        </Button>
        {activeBookHref && (
          <Button
            asChild
            size="sm"
            variant="outline"
            className="flex-1"
          >
            <Link href={activeBookHref}>
              <BookOpen className="h-4 w-4" />
              Open book
            </Link>
          </Button>
        )}
      </div>
    </Card>
  );
}

export default function Dashboard() {
  const { user, isLoaded } = useUser();
  const [activeTab, setActiveTab] = useState<TabType>("active");

  const { data: books, isPending: booksPending } = useQuery({
    ...convexQuery(api.books.getBooks, { userId: user?.id || "" }),
    enabled: isLoaded && !!user?.id && activeTab === "active",
  });

  const { data: archivedBooks, isPending: archivedPending } = useQuery({
    ...convexQuery(api.books.getArchivedBooks, { userId: user?.id || "" }),
    enabled: isLoaded && !!user?.id && activeTab === "archived",
  });

  const { data: communities } = useQuery({
    ...convexQuery(api.communities.getMyCommunities, {}),
    enabled: isLoaded && !!user?.id,
  });

  const { data: convexUser } = useQuery({
    ...convexQuery(api.users.getUserByClerkId, {
      clerkId: user?.id ?? "",
    }),
    enabled: !!user?.id,
  });

  const profileHref = user?.id ? `/user/${convexUser?.slug ?? user.id}` : "#";

  const isPending = activeTab === "active" ? booksPending : archivedPending;
  const booksWithProgress = (
    activeTab === "active" ? books || [] : archivedBooks || []
  ) as DashboardBook[];
  const myCommunities = (communities as CommunityPreview[] | undefined) ?? [];

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
        {booksWithProgress.length === 0 ? (
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
      <div className="mx-auto max-w-6xl p-3 sm:p-6">
        {myCommunities.length > 0 && (
          <section className="mb-8 sm:mb-10">
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-xl font-bold text-foreground sm:text-3xl">
                  My Communities
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Open the reading communities you belong to.
                </p>
              </div>
              <Button
                asChild
                variant="outline"
                size="sm"
              >
                <Link href="/communities">View all communities</Link>
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {myCommunities.map((community) => (
                <CommunityDashboardCard
                  key={community._id}
                  community={community}
                />
              ))}
            </div>
          </section>
        )}

        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
              My Books
            </h1>
            <p className="mt-1 text-sm text-muted-foreground sm:mt-2 sm:text-base">
              Track your reading progress
            </p>
          </div>
          {/* <Button variant="outline" size="sm" asChild>
            <Link href="/dashboard/settings">Reminder settings</Link>
          </Button> */}
        </div>

        <div className="mb-4 flex gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
          <Tabs
            value={activeTab}
            onValueChange={(value: string) => setActiveTab(value as TabType)}
            className="w-full"
          >
            <TabsList className="w-full sm:w-auto">
              <TabsTrigger
                value="active"
                className="flex-1 sm:flex-none"
              >
                Active
              </TabsTrigger>
              <TabsTrigger
                value="archived"
                className="flex-1 sm:flex-none"
              >
                Archived
              </TabsTrigger>
            </TabsList>
          </Tabs>

          {activeTab === "active" && (
            <Button asChild>
              <Link href="/books/new">+ Add New Book</Link>
            </Button>
          )}
        </div>

        <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-800 dark:bg-blue-950 sm:mb-6 sm:p-4">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="mb-1 text-xs font-semibold text-blue-900 dark:text-blue-100 sm:text-sm">
                💡 Discover Public Reading Tracker
              </h3>
              <p className="mb-2 text-xs leading-relaxed text-blue-700 dark:text-blue-300 sm:text-sm">
                Want to see how others are tracking their reading? Visit the
                public page to explore all public reading journeys and get
                inspiration for your own reading goals.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  asChild
                  variant="default"
                  size="sm"
                  className="bg-blue-600 hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                >
                  <Link href="/public">View Public Books →</Link>
                </Button>
                {profileHref !== "#" && (
                  <Button
                    asChild
                    variant="outline"
                    size="sm"
                  >
                    <Link href={profileHref}>My public profile</Link>
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {content}
      </div>
    </>
  );
}
