"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { ArrowLeft, Loader2, MessageSquareText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import CommunityThemeProvider from "@/components/CommunityThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ReflectionItem } from "../CommunityBookDetailPageClient";

export default function CommunityBookReflectionsPageClient() {
  const params = useParams<{ slug: string; bookId: string }>();
  const { user, isLoaded } = useUser();
  const slug = params.slug;
  const communityBookId = params.bookId as Id<"communityBooks">;

  const { data: community } = useQuery({
    ...convexQuery(api.communities.getCommunityBySlug, { slug }),
    enabled: !!slug,
  });

  const { data: book } = useQuery({
    ...convexQuery(api.communities.getCommunityBook, { communityBookId }),
    retry: false,
  });

  const {
    data: reflections = [],
    isPending,
    error,
  } = useQuery({
    ...convexQuery(api.communities.getCommunityBookReflections, {
      communityBookId,
    }),
    enabled: Boolean(user),
    retry: false,
  });

  return (
    <CommunityThemeProvider brandColor={community?.brandColor}>
      <Navigation />
      <main className="mx-auto max-w-3xl p-3 sm:p-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href={`/communities/${slug}/books/${communityBookId}`}>
            <ArrowLeft className="h-4 w-4" />
            Book
          </Link>
        </Button>

        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground sm:text-4xl">
            <MessageSquareText className="h-7 w-7" />
            Community reflections
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            {book
              ? `Everything members took away from "${book.name}", day by day.`
              : "Member reflections from this community book."}
          </p>
        </div>

        {!isLoaded ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !user ? (
          <Card className="p-6 text-center sm:p-10">
            <p className="text-sm text-muted-foreground">
              Sign in to read community reflections.
            </p>
            <SignInButton
              mode="modal"
              forceRedirectUrl={`/communities/${slug}/books/${communityBookId}/reflections`}
              signUpForceRedirectUrl={`/communities/${slug}/books/${communityBookId}/reflections`}
            >
              <Button className="mt-4">Sign in</Button>
            </SignInButton>
          </Card>
        ) : error ? (
          <Card className="p-6 text-center text-sm text-muted-foreground sm:p-10">
            Reflections are visible to community members only.
          </Card>
        ) : isPending ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : reflections.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground sm:p-10">
            No reflections yet. Reflections members add to their read days will
            show up here.
          </Card>
        ) : (
          <Card className="space-y-5 p-5 sm:p-6">
            {reflections.map((reflection) => (
              <ReflectionItem
                key={reflection.sessionId}
                reflection={reflection}
              />
            ))}
          </Card>
        )}
      </main>
    </CommunityThemeProvider>
  );
}
