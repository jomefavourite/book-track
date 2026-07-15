"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import { ArrowLeft, Loader2, MessageSquareText, Search } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import CommunityThemeProvider from "@/components/CommunityThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ReflectionItem } from "../CommunityBookDetailPageClient";

export default function CommunityBookReflectionsPageClient() {
  const params = useParams<{ slug: string; bookId: string }>();
  const { user, isLoaded } = useUser();
  const slug = params.slug;
  const communityBookId = params.bookId as Id<"communityBooks">;
  const [reflectionSearch, setReflectionSearch] = useState("");

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
  const normalizedReflectionSearch = reflectionSearch.trim().toLocaleLowerCase();
  const filteredReflections = useMemo(
    () =>
      normalizedReflectionSearch
        ? reflections.filter((reflection) =>
            (reflection.userName ?? "A member")
              .toLocaleLowerCase()
              .includes(normalizedReflectionSearch)
          )
        : reflections,
    [normalizedReflectionSearch, reflections]
  );

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
          <Card className="p-5 sm:p-6">
            <div className="mb-5 flex items-center gap-3">
              <div className="relative min-w-0 flex-1">
                <label
                  htmlFor="reflection-page-search"
                  className="sr-only"
                >
                  Search reflections by member name
                </label>
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                />
                <Input
                  id="reflection-page-search"
                  type="search"
                  value={reflectionSearch}
                  onChange={(event) =>
                    setReflectionSearch(event.target.value)
                  }
                  placeholder="Search by member name..."
                  className="pl-9"
                />
              </div>
              <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                {normalizedReflectionSearch
                  ? `${filteredReflections.length} of ${reflections.length}`
                  : reflections.length}
              </span>
            </div>

            {filteredReflections.length === 0 ? (
              <p
                role="status"
                className="rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
              >
                No reflections found for &ldquo;{reflectionSearch.trim()}&rdquo;.
              </p>
            ) : (
              <div className="space-y-5">
                {filteredReflections.map((reflection) => (
                  <ReflectionItem
                    key={reflection.sessionId}
                    reflection={reflection}
                  />
                ))}
              </div>
            )}
          </Card>
        )}
      </main>
    </CommunityThemeProvider>
  );
}
