"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import { convexQuery } from "@convex-dev/react-query";
import {
  ArrowLeft,
  BookOpen,
  CalendarDays,
  Lock,
  Plus,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type CommunityDetail = {
  _id: Id<"communities">;
  name: string;
  slug: string;
  description?: string;
  visibility: "public" | "private";
  currentBookTitle?: string;
  currentBookAuthor?: string;
  totalChapters?: number;
  ownerName?: string;
  brandColor?: string;
  memberCount: number;
  viewerRole?: "owner" | "admin" | "moderator" | "member";
  isLocked: boolean;
  access: "locked" | "public" | "member";
};

type CommunityBook = {
  _id: Id<"communityBooks">;
  name: string;
  author?: string;
  totalPages?: number;
  totalChapters?: number;
  progressStyle?: "pages" | "chapters";
  ignorePages?: boolean;
  readingMode: "calendar" | "fixed-days";
  startDate: string;
  endDate: string;
  daysToRead?: number;
};

function canManage(role?: string) {
  return role === "owner" || role === "admin";
}

export default function CommunityDetailPageClient() {
  const params = useParams<{ slug: string }>();
  const { user } = useUser();
  const slug = params.slug;

  const { data: community, isPending } = useQuery({
    ...convexQuery(api.communities.getCommunityBySlug, { slug }),
    enabled: !!slug,
  });

  const detail = community as CommunityDetail | null | undefined;
  const communityId = detail?._id ?? ("placeholder" as Id<"communities">);
  const shouldLoadBooks = !!detail?._id && detail.access !== "locked";
  const { data: communityBooks, isPending: booksPending } = useQuery({
    ...convexQuery(api.communities.getCommunityBooks, {
      communityId,
    }),
    enabled: shouldLoadBooks,
  });
  const books = (communityBooks as CommunityBook[] | undefined) ?? [];

  return (
    <>
      <Navigation />
      <main className="mx-auto max-w-6xl p-3 sm:p-6">
        <Button variant="ghost" asChild className="mb-4 px-0">
          <Link href="/communities">
            <ArrowLeft className="h-4 w-4" />
            Communities
          </Link>
        </Button>

        {isPending ? (
          <Card className="p-6 text-muted-foreground">Loading community...</Card>
        ) : !detail ? (
          <Card className="p-6 text-center sm:p-10">
            <h1 className="text-2xl font-bold text-foreground">
              Community not found
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              This community may have been removed or archived.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            <section className="rounded-lg border border-border bg-card p-5 text-card-foreground shadow-sm sm:p-8">
              <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-3">
                    <span
                      className="h-4 w-4 rounded-full border border-border"
                      style={{ backgroundColor: detail.brandColor ?? "transparent" }}
                      aria-hidden="true"
                    />
                    <span className="rounded-md border border-border px-2 py-1 text-xs font-medium capitalize text-muted-foreground">
                      {detail.visibility}
                    </span>
                    {detail.isLocked && (
                      <span className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-medium text-muted-foreground">
                        <Lock className="h-3 w-3" />
                        Locked activity
                      </span>
                    )}
                  </div>
                  <h1 className="mt-4 text-3xl font-bold text-foreground sm:text-5xl">
                    {detail.name}
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                    {detail.description || "A reading community."}
                  </p>
                </div>

                {canManage(detail.viewerRole) && (
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button asChild>
                      <Link href={`/communities/${detail.slug}/books/new`}>
                        <Plus className="h-4 w-4" />
                        Add Community Book
                      </Link>
                    </Button>
                    <Button asChild variant="outline">
                      <Link href={`/communities/${detail.slug}/settings`}>
                        <Settings className="h-4 w-4" />
                        Settings
                      </Link>
                    </Button>
                  </div>
                )}
              </div>
            </section>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
              <section className="space-y-6">
                {detail.access === "locked" ? (
                  <Card className="p-5 sm:p-6">
                    <div className="flex items-start gap-3">
                      <div className="rounded-md bg-muted p-3">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <h2 className="text-lg font-semibold text-foreground">
                          Private activity is locked
                        </h2>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                          This private community is discoverable, but members,
                          activity, schedules, and admin tools are available
                          only after joining by invite.
                        </p>
                        {!user && (
                          <SignInButton mode="modal">
                            <Button className="mt-4">Sign In</Button>
                          </SignInButton>
                        )}
                      </div>
                    </div>
                  </Card>
                ) : (
                  <>
                    <Card className="p-5 sm:p-6">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h2 className="text-lg font-semibold text-foreground">
                            Community books
                          </h2>
                          <p className="mt-1 text-sm text-muted-foreground">
                            Shared reading plans created by community admins.
                          </p>
                        </div>
                        {canManage(detail.viewerRole) && (
                          <Button asChild size="sm">
                            <Link href={`/communities/${detail.slug}/books/new`}>
                              <Plus className="h-4 w-4" />
                              Add book
                            </Link>
                          </Button>
                        )}
                      </div>

                      {booksPending ? (
                        <p className="mt-4 text-sm text-muted-foreground">
                          Loading community books...
                        </p>
                      ) : books.length === 0 ? (
                        <div className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                          No community books yet.
                          {canManage(detail.viewerRole)
                            ? " Add the first shared book for this community."
                            : ""}
                        </div>
                      ) : (
                        <div className="mt-4 grid gap-3">
                          {books.map((book) => {
                            const chapterOnly =
                              book.progressStyle === "chapters" &&
                              book.ignorePages === true;
                            return (
                              <Link
                                key={book._id}
                                href={`/communities/${detail.slug}/books/${book._id}`}
                                className="block rounded-md border border-border p-4 transition-colors hover:bg-muted/50"
                              >
                                <div className="flex items-start gap-3">
                                  <div className="rounded-md bg-primary/10 p-3">
                                    <BookOpen className="h-5 w-5 text-primary" />
                                  </div>
                                  <div className="min-w-0">
                                    <p className="font-semibold text-foreground">
                                      {book.name}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {book.author ? `By ${book.author} • ` : ""}
                                      {chapterOnly
                                        ? `${book.totalChapters?.toLocaleString() ?? 0} chapters`
                                        : `${book.totalPages?.toLocaleString() ?? 0} pages`}
                                    </p>
                                    <p className="mt-1 text-xs text-muted-foreground">
                                      {book.readingMode === "calendar"
                                        ? `${book.startDate} to ${book.endDate}`
                                        : `${book.daysToRead ?? 0} days`}
                                    </p>
                                  </div>
                                </div>
                              </Link>
                            );
                          })}
                        </div>
                      )}
                    </Card>

                    {detail.currentBookTitle && detail.totalChapters && (
                      <Card className="p-5 sm:p-6">
                        <h2 className="text-lg font-semibold text-foreground">
                          Legacy current read
                        </h2>
                        <p className="mt-2 text-sm text-muted-foreground">
                          {detail.currentBookTitle}
                          {detail.currentBookAuthor
                            ? ` by ${detail.currentBookAuthor}`
                            : ""}
                          {" • "}
                          {detail.totalChapters.toLocaleString()} chapters
                        </p>
                      </Card>
                    )}
                  </>
                )}
              </section>

              <aside className="space-y-4">
                <Card className="p-5">
                  <h2 className="text-lg font-semibold text-foreground">
                    Community details
                  </h2>
                  <div className="mt-4 space-y-3 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>
                        {detail.memberCount.toLocaleString()}{" "}
                        {detail.memberCount === 1 ? "member" : "members"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-4 w-4" />
                      <span>Shared community books</span>
                    </div>
                    {detail.viewerRole && (
                      <div className="flex items-center gap-2">
                        <ShieldCheck className="h-4 w-4" />
                        <span className="capitalize">
                          Your role: {detail.viewerRole}
                        </span>
                      </div>
                    )}
                  </div>
                </Card>
                {detail.visibility === "private" && (
                  <Card className="p-5">
                    <h2 className="text-lg font-semibold text-foreground">
                      Joining
                    </h2>
                    <p className="mt-2 text-sm text-muted-foreground">
                      This community is invite-only. Ask an admin for a private
                      invite link.
                    </p>
                  </Card>
                )}
              </aside>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
