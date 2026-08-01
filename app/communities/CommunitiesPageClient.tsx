"use client";

import Link from "next/link";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import {
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Users,
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
};

function VisibilityBadge({ visibility }: { visibility: "public" | "private" }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
      {visibility === "private" ? <Lock className="h-3 w-3" /> : <Search className="h-3 w-3" />}
      {visibility}
    </span>
  );
}

function CommunityLogo({ community }: { community: CommunityPreview }) {
  if (community.logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={community.logoUrl}
        alt={`${community.name} logo`}
        className="h-14 w-14 shrink-0 rounded-lg border border-border object-cover"
      />
    );
  }
  const brandTheme = getBrandTheme(community.brandColor);
  return (
    <span
      className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-border text-xl font-semibold uppercase text-foreground"
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
  return (
    <Card className="flex h-full flex-col p-4">
      <div className="flex items-center gap-3">
        <CommunityLogo community={community} />
        <h3 className="min-w-0 flex-1 truncate text-lg font-semibold text-foreground">
          {community.name}
        </h3>
      </div>
      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
        {community.description || "A reading community."}
      </p>

      <div className="mt-3 space-y-1.5 text-sm">
        <VisibilityBadge visibility={community.visibility} />
        {community.currentBookTitle && community.totalChapters && (
          <div className="rounded-md border border-border bg-muted/40 p-3 text-muted-foreground">
            <p className="font-medium text-foreground">
              Legacy current read: {community.currentBookTitle}
            </p>
            <p className="mt-1 text-xs">
              {community.totalChapters.toLocaleString()} chapters
              {community.currentBookAuthor
                ? ` by ${community.currentBookAuthor}`
                : ""}
            </p>
          </div>
        )}
        <div className="flex items-center gap-2 text-muted-foreground">
          <Users className="h-4 w-4" />
          <span>
            {community.memberCount.toLocaleString()}{" "}
            {community.memberCount === 1 ? "member" : "members"}
          </span>
        </div>
        {community.viewerRole && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <ShieldCheck className="h-4 w-4" />
            <span className="capitalize">Your role: {community.viewerRole}</span>
          </div>
        )}
      </div>

      {community.isLocked && (
        <div className="mt-3 rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground">
          Private activity is locked. Members join by invite only.
        </div>
      )}

      <div className="mt-auto pt-4">
        <Button asChild variant={community.isMember ? "default" : "outline"} className="w-full">
          <Link href={`/communities/${community.slug}`}>
            {community.isMember ? "Open community" : "View profile"}
          </Link>
        </Button>
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
            <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
              Communities
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground sm:mt-2 sm:text-base">
              Discover reading communities. Private groups are visible here, but
              their activity stays locked unless you are a member.
            </p>
          </div>
          {creatorStatus?.canCreate && (
            <Button asChild>
              <Link href="/communities/new">
                <Plus className="h-4 w-4" />
                Create Community
              </Link>
            </Button>
          )}
        </div>

        {!isLoaded ? (
          <section className="space-y-8">
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Your communities
              </h2>
              <CommunityCardSkeletonGrid count={2} />
            </div>
          </section>
        ) : !user ? (
          <Card className="p-6 text-center sm:p-10">
            <h2 className="text-xl font-semibold text-foreground">
              Sign in to join communities
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              You can discover public and private communities here, but you need
              an account to join by invite or manage your groups.
            </p>
            <SignInButton mode="modal">
              <Button className="mt-5">Sign In</Button>
            </SignInButton>
          </Card>
        ) : (
          <section className="space-y-8">
            <div>
              <h2 className="mb-4 text-lg font-semibold text-foreground">
                Your communities
              </h2>
              {myPending ? (
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
        )}
      </main>
    </>
  );
}
