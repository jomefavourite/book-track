"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useUser, SignInButton } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { format } from "date-fns";
import {
  ArrowLeft,
  BookOpenText,
  ImagePlus,
  Loader2,
  MessageSquareText,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import CommunityThemeProvider from "@/components/CommunityThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/use-toast";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { DAY_TYPE_META, type ScheduleDayType } from "@/lib/scheduleDayType";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Role = "owner" | "admin" | "moderator" | "member";

type ScheduleEntry = {
  _id: Id<"communityBookSchedule">;
  date: string;
  dayType: ScheduleDayType;
  chapterNumber?: number;
  notes?: string;
};

type Reflection = {
  sessionId: Id<"readingSessions">;
  userId: string;
  userName?: string;
  userImageUrl?: string;
  date: string;
  chapterNumber?: number;
  reflectionNote: string;
};

function canManageBooks(role?: Role) {
  return role === "owner" || role === "admin" || role === "moderator";
}

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  active: "Active",
  completed: "Completed",
};

export default function CommunityBookDetailPageClient() {
  const params = useParams<{ slug: string; bookId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user, isLoaded } = useUser();
  const slug = params.slug;
  const communityBookId = params.bookId as Id<"communityBooks">;
  const [trackError, setTrackError] = useState<string | null>(null);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [reflectionSearch, setReflectionSearch] = useState("");

  const { data: community } = useQuery({
    ...convexQuery(api.communities.getCommunityBySlug, { slug }),
    enabled: !!slug,
  });

  const { data: book, isPending: bookPending } = useQuery({
    ...convexQuery(api.communities.getCommunityBook, { communityBookId }),
    retry: false,
  });

  const viewerRole = book?.viewerRole as Role | undefined;
  const isMember = viewerRole !== undefined;
  const isManager = canManageBooks(viewerRole);

  const { data: myBookId } = useQuery({
    ...convexQuery(api.communities.getMyTrackingForCommunityBook, {
      communityBookId,
    }),
    enabled: Boolean(user && book),
  });

  const { data: schedule = [] } = useQuery({
    ...convexQuery(api.communitySchedule.getScheduleForBook, {
      communityBookId,
    }),
    enabled: Boolean(book),
  });

  const { data: reflections = [] } = useQuery({
    ...convexQuery(api.communities.getCommunityBookReflections, {
      communityBookId,
    }),
    enabled: Boolean(user && book && isMember),
    retry: false,
  });

  const { mutateAsync: trackBook, isPending: trackPending } = useMutation({
    mutationFn: useConvexMutation(api.communities.trackCommunityBook),
  });

  const generateUploadUrl = useConvexMutation(
    api.communities.generateUploadUrl
  );
  const saveCover = useConvexMutation(api.communities.saveCommunityBookCover);
  const deleteCommunityBook = useConvexMutation(
    api.communities.deleteCommunityBook
  );

  const handleDeleteBook = async () => {
    setIsDeleting(true);
    try {
      await deleteCommunityBook({ communityBookId });
      router.push(`/communities/${slug}`);
    } catch {
      toast({ title: "Could not delete book", variant: "destructive" });
      setIsDeleting(false);
      setShowDeleteDialog(false);
    }
  };

  const scheduleEntries = schedule as ScheduleEntry[];
  const reflectionFeed = reflections as Reflection[];
  const normalizedReflectionSearch = reflectionSearch
    .trim()
    .toLocaleLowerCase();
  const filteredReflectionFeed = useMemo(
    () =>
      normalizedReflectionSearch
        ? reflectionFeed.filter((reflection) =>
            (reflection.userName ?? "A member")
              .toLocaleLowerCase()
              .includes(normalizedReflectionSearch)
          )
        : reflectionFeed,
    [normalizedReflectionSearch, reflectionFeed]
  );

  const readingDayCount = useMemo(
    () => scheduleEntries.filter((entry) => entry.dayType === "reading").length,
    [scheduleEntries]
  );

  const handleStartTracking = async () => {
    if (trackPending) return;
    setTrackError(null);
    try {
      const bookId = await trackBook({ communityBookId });
      router.push(`/books/${bookId}`);
    } catch (caught) {
      setTrackError(
        caught instanceof Error ? caught.message : "Unable to start tracking."
      );
    }
  };

  const handleCoverSelected = async (file: File | undefined) => {
    if (!file) return;
    setCoverUploading(true);
    try {
      const uploadUrl = await generateUploadUrl({});
      const response = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!response.ok) throw new Error("Upload failed");
      const { storageId } = await response.json();
      await saveCover({ communityBookId, storageId });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.getCommunityBook, {
          communityBookId,
        }).queryKey,
      });
      toast({ title: "Cover updated" });
    } catch {
      toast({ title: "Cover upload failed", variant: "destructive" });
    } finally {
      setCoverUploading(false);
      if (coverInputRef.current) coverInputRef.current.value = "";
    }
  };

  const chapterOnly =
    book?.progressStyle === "chapters" && book?.ignorePages === true;

  return (
    <CommunityThemeProvider brandColor={community?.brandColor}>
      <Navigation />
      <main className="mx-auto max-w-6xl p-3 sm:p-6">
        <Button
          variant="ghost"
          asChild
          className="mb-4"
        >
          <Link href={`/communities/${slug}`}>
            <ArrowLeft className="h-4 w-4" />
            Community
          </Link>
        </Button>

        {bookPending || !isLoaded ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !book ? (
          <Card className="p-6 text-center sm:p-10">
            <p className="text-sm text-muted-foreground">
              This book could not be opened. It may have been removed.
            </p>
            <Button
              asChild
              variant="outline"
              className="mt-4"
            >
              <Link href={`/communities/${slug}`}>Back to community</Link>
            </Button>
          </Card>
        ) : (
          <div className="space-y-6">
            <Card className="overflow-hidden">
              <div
                className="h-2 w-full"
                style={{ backgroundColor: "var(--brand)" }}
                aria-hidden="true"
              />
              <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
                {book.coverImageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={book.coverImageUrl}
                    alt={`Cover of ${book.name}`}
                    className="h-44 w-32 shrink-0 rounded-md border border-border object-cover shadow-sm"
                  />
                ) : (
                  <div
                    className="flex h-44 w-32 shrink-0 items-center justify-center rounded-md border"
                    style={{
                      backgroundColor: "var(--brand-soft)",
                      borderColor: "var(--brand-border)",
                    }}
                  >
                    <BookOpenText className="h-10 w-10 text-muted-foreground" />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className="rounded-md px-2 py-1 text-xs font-medium"
                      style={
                        (book.status ?? "upcoming") === "active"
                          ? {
                              backgroundColor: "var(--brand)",
                              color: "var(--brand-foreground)",
                            }
                          : {
                              backgroundColor: "var(--brand-soft)",
                              border: "1px solid var(--brand-border)",
                            }
                      }
                    >
                      {STATUS_LABELS[book.status ?? "upcoming"]}
                    </span>
                    {book.completedAt && (
                      <span className="text-xs text-muted-foreground">
                        Finished{" "}
                        {format(new Date(book.completedAt), "MMM d, yyyy")}
                      </span>
                    )}
                  </div>
                  <h1 className="mt-2 text-2xl font-bold text-foreground sm:text-4xl">
                    {book.name}
                  </h1>
                  <p className="mt-1 text-sm text-muted-foreground sm:text-base">
                    {book.author ? `By ${book.author} • ` : ""}
                    {chapterOnly
                      ? `${book.totalChapters?.toLocaleString() ?? 0} chapters`
                      : `${book.totalPages?.toLocaleString() ?? 0} pages`}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {format(
                      parseDateFromStorage(book.startDate),
                      "MMM d, yyyy"
                    )}{" "}
                    to{" "}
                    {format(parseDateFromStorage(book.endDate), "MMM d, yyyy")}
                  </p>

                  {isManager && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      <Button
                        asChild
                        size="sm"
                        variant="outline"
                      >
                        <Link
                          href={`/communities/${slug}/books/${communityBookId}/schedule`}
                        >
                          <Pencil className="h-4 w-4" />
                          Manage schedule
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={coverUploading}
                        onClick={() => coverInputRef.current?.click()}
                      >
                        <ImagePlus className="h-4 w-4" />
                        {coverUploading
                          ? "Uploading..."
                          : book.coverImageUrl
                            ? "Change cover"
                            : "Upload cover"}
                      </Button>
                      <input
                        ref={coverInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(event) =>
                          handleCoverSelected(event.target.files?.[0])
                        }
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                        onClick={() => setShowDeleteDialog(true)}
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete book
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground">
                Your reading
              </h2>
              {!user ? (
                <div className="mt-3">
                  <p className="text-sm text-muted-foreground">
                    Sign in to track your reading for this community book.
                  </p>
                  <SignInButton
                    mode="modal"
                    forceRedirectUrl={`/communities/${slug}/books/${communityBookId}`}
                    signUpForceRedirectUrl={`/communities/${slug}/books/${communityBookId}`}
                  >
                    <Button className="mt-3">Sign in</Button>
                  </SignInButton>
                </div>
              ) : !isMember ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  Join this community to track this book. Ask an admin for an
                  invite link.
                </p>
              ) : myBookId ? (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    You are tracking this book. Keep logging your daily reading.
                  </p>
                  <Button
                    asChild
                    style={{
                      backgroundColor: "var(--brand)",
                      color: "var(--brand-foreground)",
                    }}
                  >
                    <Link href={`/books/${myBookId}`}>Continue reading</Link>
                  </Button>
                </div>
              ) : (book.status ?? "upcoming") !== "active" ? (
                <div className="mt-3 rounded-md border border-border bg-muted/40 p-4">
                  <p className="text-sm font-medium text-foreground">
                    Tracking not open yet
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    An admin needs to set this book to{" "}
                    <span className="font-medium text-foreground">Active</span>{" "}
                    before members can start tracking. Check back once it goes
                    live.
                  </p>
                  <Button
                    className="mt-3"
                    disabled
                    size="sm"
                  >
                    Start Tracking
                  </Button>
                </div>
              ) : (
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Start tracking to get your own reading plan
                    {readingDayCount > 0
                      ? " based on the community schedule"
                      : ""}
                    .
                  </p>
                  <Button
                    onClick={handleStartTracking}
                    disabled={trackPending}
                    style={{
                      backgroundColor: "var(--brand)",
                      color: "var(--brand-foreground)",
                    }}
                  >
                    {trackPending ? "Starting..." : "Start Tracking"}
                  </Button>
                </div>
              )}
              {trackError && (
                <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {trackError}
                </p>
              )}
            </Card>

            <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
              {/* Community reflections — the focus of this page */}
              {isMember ? (
                <Card className="p-5 sm:p-6">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                        <MessageSquareText className="h-5 w-5" />
                        Community reflections
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        What members took away from each day&apos;s reading.
                      </p>
                    </div>
                    {reflectionFeed.length > 0 && (
                      <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground">
                        {normalizedReflectionSearch
                          ? `${filteredReflectionFeed.length} of ${reflectionFeed.length}`
                          : reflectionFeed.length}
                      </span>
                    )}
                  </div>

                  {myBookId && (
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="mt-4"
                    >
                      <Link href={`/books/${myBookId}`}>
                        <Pencil className="h-4 w-4" />
                        Add your reflection
                      </Link>
                    </Button>
                  )}

                  {reflectionFeed.length > 0 && (
                    <div className="relative mt-4 w-full">
                      <label
                        htmlFor="reflection-search"
                        className="sr-only"
                      >
                        Search reflections by member name
                      </label>
                      <Search
                        aria-hidden="true"
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                      />
                      <Input
                        id="reflection-search"
                        type="search"
                        value={reflectionSearch}
                        onChange={(event) =>
                          setReflectionSearch(event.target.value)
                        }
                        placeholder="Search by member name..."
                        className="pl-9 "
                      />
                    </div>
                  )}

                  {reflectionFeed.length === 0 ? (
                    <p className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                      No reflections yet. Reflections members add to their read
                      days will show up here.
                    </p>
                  ) : filteredReflectionFeed.length === 0 ? (
                    <p
                      role="status"
                      className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground"
                    >
                      No reflections found for &ldquo;
                      {reflectionSearch.trim()}&rdquo;.
                    </p>
                  ) : (
                    <div className="mt-4 divide-y divide-border">
                      {filteredReflectionFeed.map((reflection) => (
                        <div
                          key={reflection.sessionId}
                          className="py-4 first:pt-0 last:pb-0"
                        >
                          <ReflectionItem reflection={reflection} />
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ) : (
                <Card className="p-5 sm:p-6">
                  <h2 className="flex items-center gap-2 text-xl font-semibold text-foreground">
                    <MessageSquareText className="h-5 w-5" />
                    Community reflections
                  </h2>
                  <p className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                    Join this community to read and share reflections on this
                    book.
                  </p>
                </Card>
              )}

              {/* Reading schedule — supporting context */}
              {scheduleEntries.length > 0 && (
                <Card className="p-5 sm:p-6">
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">
                      Reading schedule
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {readingDayCount} reading{" "}
                      {readingDayCount === 1 ? "day" : "days"},{" "}
                      {scheduleEntries.length - readingDayCount} rest,
                      reflection or catch-up{" "}
                      {scheduleEntries.length - readingDayCount === 1
                        ? "day"
                        : "days"}
                      .
                    </p>
                  </div>
                  <div className="mt-4 max-h-96 space-y-1 overflow-y-auto pr-1">
                    {scheduleEntries.map((entry) => {
                      const meta = DAY_TYPE_META[entry.dayType];
                      const Icon = meta.icon;
                      const isReading = entry.dayType === "reading";
                      return (
                        <div
                          key={entry._id}
                          className="flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
                          style={
                            isReading
                              ? {
                                  backgroundColor: "var(--brand-soft)",
                                  borderColor: "var(--brand-border)",
                                }
                              : { borderColor: "var(--border)" }
                          }
                        >
                          <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="w-24 shrink-0 font-medium text-foreground">
                            {format(
                              parseDateFromStorage(entry.date),
                              "EEE, MMM d"
                            )}
                          </span>
                          <span className="text-muted-foreground">
                            {meta.label}
                            {isReading && entry.chapterNumber !== undefined
                              ? ` • Chapter ${entry.chapterNumber}`
                              : ""}
                            {entry.notes ? ` • ${entry.notes}` : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
          </div>
        )}
      </main>

      <Dialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete community book?</DialogTitle>
            <DialogDescription>
              &quot;{book?.name}&quot; and its reading schedule will be
              permanently deleted. Members who are already tracking this book
              keep their personal copy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDeleteBook}
              disabled={isDeleting}
            >
              {isDeleting ? "Deleting..." : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </CommunityThemeProvider>
  );
}

export function ReflectionItem({ reflection }: { reflection: Reflection }) {
  const initial = (reflection.userName ?? "?").trim().charAt(0).toUpperCase();
  return (
    <div className="flex gap-3">
      {reflection.userImageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={reflection.userImageUrl}
          alt=""
          className="h-9 w-9 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold"
          style={{
            backgroundColor: "var(--brand-soft)",
            border: "1px solid var(--brand-border)",
          }}
        >
          {initial || "?"}
        </div>
      )}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {reflection.userName ?? "A member"}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {format(parseDateFromStorage(reflection.date), "MMM d, yyyy")}
            {reflection.chapterNumber !== undefined
              ? ` • Chapter ${reflection.chapterNumber}`
              : ""}
          </span>
        </p>
        <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {reflection.reflectionNote}
        </p>
      </div>
    </div>
  );
}
