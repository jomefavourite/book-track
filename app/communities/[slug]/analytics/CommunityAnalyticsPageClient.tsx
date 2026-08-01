"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { ArrowLeft, BookOpen, Users } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { DetailPageSkeleton } from "@/components/CommunityCardSkeleton";
import { Progress } from "@/components/ui/progress";

type CommunityDetail = {
  _id: Id<"communities">;
  name: string;
  slug: string;
  viewerRole?: "owner" | "admin" | "moderator" | "member";
};

function canManage(role?: string) {
  return role === "owner" || role === "admin";
}

function formatDate(dateStr?: string) {
  if (!dateStr) return null;
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

export default function CommunityAnalyticsPageClient() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  const { data: community, isPending: communityPending } = useQuery({
    ...convexQuery(api.communities.getCommunityBySlug, { slug }),
    enabled: !!slug,
  });

  const detail = community as CommunityDetail | null | undefined;
  const communityId = detail?._id;
  const canViewAnalytics = canManage(detail?.viewerRole);
  const canLoadProgress = !!communityId && canViewAnalytics;

  const { data: progressData, isPending: progressPending } = useQuery(
    convexQuery(
      api.communities.getCommunityMemberProgress,
      canLoadProgress ? { communityId } : "skip"
    )
  );

  const isPending = communityPending || (canViewAnalytics && progressPending);

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-5xl p-3 sm:p-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href={`/communities/${slug}`}>
            <ArrowLeft className="h-4 w-4" />
            {detail?.name ?? "Community"}
          </Link>
        </Button>

        {communityPending ? (
          <DetailPageSkeleton />
        ) : !detail ? (
          <Card className="p-6 text-center sm:p-10">
            <p className="text-sm text-muted-foreground">
              Community not found.
            </p>
          </Card>
        ) : !canViewAnalytics ? (
          <Card className="p-6 text-center sm:p-10">
            <p className="text-sm text-muted-foreground">
              Only admins and owners can view analytics.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-3xl">
                Member Progress
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Reading progress per community book across all members.
              </p>
            </div>

            {isPending ? (
              <div className="space-y-4" aria-hidden="true">
                <Skeleton className="h-28 w-full rounded-lg" />
                <Skeleton className="h-28 w-full rounded-lg" />
              </div>
            ) : !progressData || progressData.length === 0 ? (
              <Card className="p-8 text-center">
                <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="mt-3 text-sm text-muted-foreground">
                  No community books yet. Add books to start tracking member
                  progress.
                </p>
                <Button asChild className="mt-4" variant="outline">
                  <Link href={`/communities/${slug}/books/new`}>
                    Add Community Book
                  </Link>
                </Button>
              </Card>
            ) : (
              <div className="space-y-8">
                {progressData.map(({ communityBook, members }) => (
                  <Card
                    key={communityBook._id}
                    className="overflow-hidden p-5 sm:p-6"
                  >
                    <div className="mb-5 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">
                          {communityBook.name}
                        </h2>
                        {communityBook.author && (
                          <p className="text-sm text-muted-foreground">
                            by {communityBook.author}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Users className="h-3.5 w-3.5" />
                        {members.length} member{members.length !== 1 ? "s" : ""}
                      </div>
                    </div>

                    <div className="space-y-4">
                      {members.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          No members yet.
                        </p>
                      ) : (
                        members.map((member) => (
                          <div key={member.clerkId}>
                            <div className="mb-1.5 flex items-center justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate text-sm font-medium text-foreground">
                                    {member.name ?? member.email ?? "Unknown"}
                                  </span>
                                  <RoleBadge role={member.role} />
                                </div>
                                {member.isTracking && member.lastReadDate && (
                                  <p className="text-xs text-muted-foreground">
                                    Last read {formatDate(member.lastReadDate)}
                                  </p>
                                )}
                                {!member.isTracking && (
                                  <p className="text-xs text-muted-foreground">
                                    Not tracking yet
                                  </p>
                                )}
                              </div>
                              <span className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                                {Math.round(member.progress)}%
                              </span>
                            </div>
                            <Progress
                              value={Math.min(member.progress, 100)}
                              className="h-2"
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </>
  );
}

function RoleBadge({
  role,
}: {
  role: "owner" | "admin" | "moderator" | "member";
}) {
  if (role === "member") return null;
  const label =
    role === "owner"
      ? "Owner"
      : role === "admin"
        ? "Admin"
        : "Moderator";
  return (
    <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium capitalize text-secondary-foreground">
      {label}
    </span>
  );
}
