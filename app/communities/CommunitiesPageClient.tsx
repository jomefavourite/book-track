"use client";

import Link from "next/link";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import {
  BookOpen,
  Lock,
  Plus,
  Search,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import Navigation from "@/components/Navigation";
import { CommunityCardSkeletonGrid } from "@/components/CommunityCardSkeleton";
import { getBrandTheme } from "@/lib/brandColor";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CommunityPreview = {
  _id: string;
  name: string;
  slug: string;
  description?: string;
  visibility: "public" | "private";
  currentBookTitle?: string;
  currentBookAuthor?: string;
  totalChapters?: number;
  memberCount: number;
  viewerRole?: "owner" | "admin" | "moderator" | "member";
  isMember: boolean;
  isLocked: boolean;
  brandColor?: string;
  logoUrl?: string | null;
  // Only present on getMyCommunities results.
  activeBook?: {
    _id: string;
    name: string;
    trackedBookId?: string | null;
  } | null;
};

function getActiveBookHref(community: CommunityPreview) {
  if (!community.activeBook) return null;
  if (community.activeBook.trackedBookId) {
    return `/books/${community.activeBook.trackedBookId}`;
  }
  return `/communities/${community.slug}/books/${community.activeBook._id}`;
}

function CommunityLogo({ community }: { community: CommunityPreview }) {
  if (community.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={community.logoUrl}
        alt={`${community.name} logo`}
        className="h-12 w-12 shrink-0 rounded-lg border border-border bg-card object-contain p-1"
      />
    );
  }
  const brandTheme = getBrandTheme(community.brandColor);
  return (
    <span
      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-lg font-semibold uppercase text-foreground"
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
      {community.name.charAt(0)}
    </span>
  );
}

function CommunityCard({ community }: { community: CommunityPreview }) {
  const activeBookHref = community.isMember ? getActiveBookHref(community) : null;
  const brandTheme = getBrandTheme(community.brandColor);
  const meta = [
    `${community.memberCount.toLocaleString()} ${community.memberCount === 1 ? "member" : "members"}`,
    community.viewerRole
      ? community.viewerRole.charAt(0).toUpperCase() + community.viewerRole.slice(1)
      : null,
  ].filter(Boolean);

  return (
    <Card className="flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md">
      {/* Thin brand strip so each community is recognisable at a glance. */}
      <div
        className="h-1.5 bg-muted"
        style={brandTheme ? { backgroundColor: brandTheme.brand } : undefined}
        aria-hidden="true"
      />
      <div className="flex flex-1 flex-col p-4">
        <div className="flex items-center gap-3">
          <CommunityLogo community={community} />
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-foreground sm:text-lg">
              {community.name}
            </h3>
            <p className="flex items-center gap-1.5 truncate text-xs text-muted-foreground">
              {community.visibility === "private" ? (
                <Lock className="h-3 w-3 shrink-0" />
              ) : (
                <Search className="h-3 w-3 shrink-0" />
              )}
              <span className="capitalize">{community.visibility}</span>
              {meta.map((item) => (
                <span key={item} className="before:mr-1.5 before:content-['·']">
                  {item}
                </span>
              ))}
            </p>
          </div>
        </div>

        <p className="mt-3 line-clamp-2 text-sm text-muted-foreground">
          {community.description || "A reading community."}
        </p>

        {community.currentBookTitle && community.totalChapters && (
          <div className="mt-3 rounded-md border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">
              Legacy current read: {community.currentBookTitle}
            </p>
            <p className="mt-0.5">
              {community.totalChapters.toLocaleString()} chapters
              {community.currentBookAuthor
                ? ` by ${community.currentBookAuthor}`
                : ""}
            </p>
          </div>
        )}

        {community.isLocked && (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            Activity is locked. Members join by invite only.
          </p>
        )}

        <div className="mt-auto flex gap-2 pt-4">
          <Button
            asChild
            size="sm"
            variant={community.isMember ? "default" : "outline"}
            className="flex-1"
          >
            <Link href={`/communities/${community.slug}`}>
              {community.isMember ? "Open community" : "View community"}
            </Link>
          </Button>
          {activeBookHref && (
            <Button asChild size="sm" variant="outline" className="flex-1">
              <Link href={activeBookHref}>
                <BookOpen className="h-4 w-4" />
                Open book
              </Link>
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function CommunitiesPageClient() {
  const { user, isLoaded } = useUser();

  const { data: creatorStatus } = useQuery({
    ...convexQuery(api.communities.getCreatorStatus, {}),
    enabled: !!user?.id,
  });

  const { data: myCommunities, isPending: myPending } = useQuery({
    ...convexQuery(api.communities.getMyCommunities, {}),
    enabled: !!user?.id,
  });

  const { data: communities, isPending: discoveryPending } = useQuery({
    ...convexQuery(api.communities.discoverCommunities, {}),
    enabled: true,
  });

  const ownedCommunityIds = new Set(
    ((myCommunities as CommunityPreview[] | undefined) ?? []).map(
      (community) => community._id
    )
  );
  const discoverableCommunities = (
    (communities as CommunityPreview[] | undefined) ?? []
  ).filter((community) => !ownedCommunityIds.has(community._id));

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-6xl p-3 sm:p-6">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-4xl">
              Communities
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:mt-2 sm:text-base">
              Discover reading communities. Private groups are visible here, but
              their activity stays locked unless you are a member.
            </p>
          </div>
          {user && creatorStatus?.canCreate ? (
            <Button asChild>
              <Link href="/communities/new">
                <Plus className="h-4 w-4" />
                Create Community
              </Link>
            </Button>
          ) : user && creatorStatus?.requestStatus === "pending" ? (
            <Button asChild variant="outline">
              <Link href="/communities/new">Request pending</Link>
            </Button>
          ) : (
            <Button asChild variant="outline">
              <Link href="/communities/new">
                <Plus className="h-4 w-4" />
                Request to create a community
              </Link>
            </Button>
          )}
        </div>

        <section className="space-y-8">
          {isLoaded && !user && (
            <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-foreground">
                  Sign in to join communities
                </h2>
                <p className="mt-1 max-w-xl text-sm text-muted-foreground">
                  Browse public and private communities below. Sign in to join
                  by invite or manage your own groups.
                </p>
              </div>
              <SignInButton mode="modal">
                <Button className="shrink-0">Sign In</Button>
              </SignInButton>
            </Card>
          )}

          {(!isLoaded || user) && (
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Your communities
              </h2>
              {!isLoaded || myPending ? (
                <CommunityCardSkeletonGrid count={2} />
              ) : ((myCommunities as CommunityPreview[] | undefined) ?? [])
                  .length === 0 ? (
                <Card className="p-6 text-sm text-muted-foreground">
                  You are not a member of any community yet. Use an invite
                  link or explore discoverable communities below.
                </Card>
              ) : (
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  {((myCommunities as CommunityPreview[] | undefined) ?? []).map(
                    (community) => (
                      <CommunityCard key={community._id} community={community} />
                    )
                  )}
                </div>
              )}
            </div>
          )}

          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">
              Discover communities
            </h2>
            {discoveryPending ? (
              <CommunityCardSkeletonGrid count={2} />
            ) : discoverableCommunities.length === 0 ? (
              <Card className="p-6 text-sm text-muted-foreground">
                No additional communities are discoverable yet.
              </Card>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {discoverableCommunities.map((community) => (
                  <CommunityCard key={community._id} community={community} />
                ))}
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
