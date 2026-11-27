"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { SignInButton, useUser } from "@clerk/nextjs";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import {
  ArrowLeft,
  BarChart2,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  Globe,
  Instagram,
  Lock,
  MessageSquareText,
  MoreVertical,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import { trackEvent } from "@/lib/analytics";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import CommunityThemeProvider from "@/components/CommunityThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  CommunityBooksSkeleton,
  CommunityDetailSkeleton,
} from "@/components/CommunityCardSkeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/components/ui/use-toast";
import { differenceInCalendarDays, format, startOfDay } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { cn } from "@/lib/utils";

type BookStatus = "upcoming" | "active" | "completed";

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
  instagramUrl?: string;
  tiktokUrl?: string;
  websiteUrl?: string;
  logoUrl?: string | null;
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
  status?: BookStatus;
  startedAt?: number;
  completedAt?: number;
  coverImageUrl?: string | null;
};

function canManageBooks(role?: string) {
  return role === "owner" || role === "admin" || role === "moderator";
}

function canManageCommunity(role?: string) {
  return role === "owner" || role === "admin";
}

function bookStatus(book: CommunityBook): BookStatus {
  return book.status ?? "upcoming";
}

export default function CommunityDetailPageClient() {
  const params = useParams<{ slug: string }>();
  const { user } = useUser();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const slug = params.slug;
  const [activeConflict, setActiveConflict] = useState<{
    bookId: Id<"communityBooks">;
    bookName: string;
    currentActiveName: string;
  } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    bookId: Id<"communityBooks">;
    bookName: string;
  } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const { data: community, isPending } = useQuery({
    ...convexQuery(api.communities.getCommunityBySlug, { slug }),
    enabled: !!slug,
  });

  const detail = community as CommunityDetail | null | undefined;
  const communityId = detail?._id;
  const shouldLoadBooks = !!communityId && detail?.access !== "locked";
  const { data: communityBooks, isPending: booksPending } = useQuery(
    convexQuery(
      api.communities.getCommunityBooks,
      shouldLoadBooks ? { communityId } : "skip"
    )
  );
  const books = useMemo(
    () => (communityBooks as CommunityBook[] | undefined) ?? [],
    [communityBooks]
  );

  const { activeBooks, upcomingBooks, completedBooks } = useMemo(() => {
    return {
      activeBooks: books.filter((book) => bookStatus(book) === "active"),
      upcomingBooks: books.filter((book) => bookStatus(book) === "upcoming"),
      completedBooks: books.filter((book) => bookStatus(book) === "completed"),
    };
  }, [books]);

  const { mutateAsync: setBookStatus } = useMutation({
    mutationFn: useConvexMutation(api.communities.setCommunityBookStatus),
    onSuccess: () => {
      if (!communityId) return;
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.getCommunityBooks, {
          communityId,
        }).queryKey,
      });
    },
  });

  const { mutateAsync: deleteBook } = useMutation({
    mutationFn: useConvexMutation(api.communities.deleteCommunityBook),
    onSuccess: () => {
      if (!communityId) return;
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communities.getCommunityBooks, {
          communityId,
        }).queryKey,
      });
    },
  });

  const handleDeleteBook = async () => {
    if (!pendingDelete) return;
    setIsDeleting(true);
    try {
      await deleteBook({ communityBookId: pendingDelete.bookId });
      setPendingDelete(null);
    } catch {
      toast({ title: "Could not delete book", variant: "destructive" });
    } finally {
      setIsDeleting(false);
    }
  };

  const handleStatusChange = async (
    book: CommunityBook,
    status: BookStatus,
    demoteCurrentActive = false
  ) => {
    try {
      const result = await setBookStatus({
        communityBookId: book._id,
        status,
        demoteCurrentActive,
      });
      if (result?.status === "conflict") {
        setActiveConflict({
          bookId: book._id,
          bookName: book.name,
          currentActiveName: result.currentActiveName,
        });
        return;
      }
      setActiveConflict(null);
      trackEvent("community_book_status_changed", { status });
    } catch {
      toast({
        title: "Could not update book status",
        variant: "destructive",
      });
    }
  };

  const showStatusControls = canManageBooks(detail?.viewerRole);
  // null = not chosen yet: default to whichever shelf actually has books.
  // Once the reader picks a shelf, keep it even if it's empty.
  const [libraryTab, setLibraryTab] = useState<
    "upcoming" | "completed" | null
  >(null);
  const shelf =
    libraryTab ??
    (upcomingBooks.length === 0 && completedBooks.length > 0
      ? "completed"
      : "upcoming");
  const shelfBooks = shelf === "upcoming" ? upcomingBooks : completedBooks;
  const deleteHandler = (book: CommunityBook) =>
    showStatusControls
      ? () => setPendingDelete({ bookId: book._id, bookName: book.name })
      : undefined;

  return (
    <CommunityThemeProvider brandColor={detail?.brandColor}>
      <Navigation />
      <main className="mx-auto max-w-6xl p-3 sm:p-6">
        <Button
          variant="ghost"
          asChild
          className="mb-4"
        >
          <Link href="/communities">
            <ArrowLeft className="h-4 w-4" />
            Communities
          </Link>
        </Button>

        {isPending ? (
          <CommunityDetailSkeleton />
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
          <div className="space-y-5 sm:space-y-6">
            {/* Hero */}
            <section
              className="overflow-hidden rounded-xl border bg-card text-card-foreground shadow-sm"
              style={{ borderColor: "var(--brand-border)" }}
            >
              <div
                className="h-20 sm:h-28"
                style={{
                  background:
                    "linear-gradient(120deg, var(--brand), var(--brand-soft) 85%)",
                }}
                aria-hidden="true"
              />
              <div className="px-4 pb-4 sm:px-6 sm:pb-5">
                <div className="-mt-9 flex items-end justify-between gap-3 sm:-mt-11">
                  {detail.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={detail.logoUrl}
                      alt={`${detail.name} logo`}
                      className="h-[72px] w-[72px] shrink-0 rounded-xl bg-card object-contain p-1.5 shadow-sm ring-4 ring-card sm:h-20 sm:w-20"
                    />
                  ) : (
                    <span
                      className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-xl text-2xl font-bold uppercase shadow-sm ring-4 ring-card sm:h-20 sm:w-20"
                      style={{
                        backgroundColor: "var(--brand)",
                        color: "var(--brand-foreground)",
                      }}
                      aria-hidden="true"
                    >
                      {detail.name.charAt(0)}
                    </span>
                  )}
                  {(canManageBooks(detail.viewerRole) ||
                    canManageCommunity(detail.viewerRole)) && (
                    <div className="flex items-center gap-2 pb-1">
                      {canManageBooks(detail.viewerRole) && (
                        <Button
                          asChild
                          size="sm"
                          className="rounded-full"
                          style={{
                            backgroundColor: "var(--brand)",
                            color: "var(--brand-foreground)",
                          }}
                        >
                          <Link href={`/communities/${detail.slug}/books/new`}>
                            <Plus className="h-4 w-4" />
                            Add book
                          </Link>
                        </Button>
                      )}
                      {canManageCommunity(detail.viewerRole) && (
                        <>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="rounded-full px-2.5 sm:px-3"
                          >
                            <Link
                              href={`/communities/${detail.slug}/analytics`}
                              aria-label="Analytics"
                            >
                              <BarChart2 className="h-4 w-4" />
                              <span className="hidden sm:inline">Analytics</span>
                            </Link>
                          </Button>
                          <Button
                            asChild
                            size="sm"
                            variant="outline"
                            className="rounded-full px-2.5 sm:px-3"
                          >
                            <Link
                              href={`/communities/${detail.slug}/settings`}
                              aria-label="Settings"
                            >
                              <Settings className="h-4 w-4" />
                              <span className="hidden sm:inline">Settings</span>
                            </Link>
                          </Button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                <h1 className="mt-3 break-words text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
                  {detail.name}
                </h1>
                <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
                  {detail.description || "A reading community."}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span className={HERO_CHIP}>
                    {detail.visibility === "private" ? (
                      <Lock className="h-3.5 w-3.5" />
                    ) : (
                      <Globe className="h-3.5 w-3.5" />
                    )}
                    {detail.visibility === "private" ? "Private · invite only" : "Public"}
                  </span>
                  <span className={HERO_CHIP}>
                    <Users className="h-3.5 w-3.5" />
                    {detail.memberCount.toLocaleString()}{" "}
                    {detail.memberCount === 1 ? "member" : "members"}
                  </span>
                  {detail.viewerRole && (
                    <span className={HERO_CHIP}>
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {ROLE_LABELS[detail.viewerRole]}
                    </span>
                  )}
                  <SocialLinks
                    instagramUrl={detail.instagramUrl}
                    tiktokUrl={detail.tiktokUrl}
                    websiteUrl={detail.websiteUrl}
                  />
                </div>
              </div>

              {detail.access !== "locked" && books.length > 0 && (
                <div className="grid grid-cols-3 divide-x divide-border border-t border-border">
                  <HeroStat value={activeBooks.length} label="Reading now" />
                  <HeroStat value={upcomingBooks.length} label="Up next" />
                  <HeroStat value={completedBooks.length} label="Finished" />
                </div>
              )}
            </section>

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
                      activity, schedules, and admin tools are available only
                      after joining by invite. Ask an admin for a private
                      invite link.
                    </p>
                    {!user && (
                      <SignInButton
                        mode="modal"
                        forceRedirectUrl={`/communities/${slug}`}
                        signUpForceRedirectUrl={`/communities/${slug}`}
                      >
                        <Button className="mt-4">Sign In</Button>
                      </SignInButton>
                    )}
                  </div>
                </div>
              </Card>
            ) : booksPending ? (
              <CommunityBooksSkeleton />
            ) : books.length === 0 ? (
              <Card className="flex flex-col items-center p-8 text-center sm:p-10">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <BookOpen className="h-6 w-6 text-muted-foreground" />
                </span>
                <h2 className="mt-3 text-lg font-semibold text-foreground">
                  No books yet
                </h2>
                <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                  {canManageBooks(detail.viewerRole)
                    ? "Add the first book this community will read together."
                    : "This community hasn't added a book to read together yet."}
                </p>
                {canManageBooks(detail.viewerRole) && (
                  <Button
                    asChild
                    className="mt-4"
                    style={{
                      backgroundColor: "var(--brand)",
                      color: "var(--brand-foreground)",
                    }}
                  >
                    <Link href={`/communities/${detail.slug}/books/new`}>
                      <Plus className="h-4 w-4" />
                      Add community book
                    </Link>
                  </Button>
                )}
              </Card>
            ) : (
              <>
                <section aria-labelledby="current-read-heading">
                  <SectionHeading id="current-read-heading" title="Current read" />
                  {activeBooks.length === 0 ? (
                    <Card className="p-5 text-sm text-muted-foreground">
                      No book is being read right now.
                      {showStatusControls
                        ? " Set an upcoming book to Active to feature it here."
                        : ""}
                    </Card>
                  ) : (
                    <div className="space-y-3">
                      {activeBooks.map((book) => (
                        <FeaturedBookCard
                          key={book._id}
                          book={book}
                          slug={detail.slug}
                          showStatusControls={showStatusControls}
                          onStatusChange={handleStatusChange}
                          onDelete={deleteHandler(book)}
                        />
                      ))}
                    </div>
                  )}
                </section>

                {(upcomingBooks.length > 0 || completedBooks.length > 0) && (
                  <section aria-labelledby="library-heading">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                      <SectionHeading id="library-heading" title="Library" flush />
                      <div
                        role="tablist"
                        aria-label="Library shelf"
                        className="inline-flex rounded-full bg-muted p-1"
                      >
                        {(
                          [
                            { value: "upcoming", label: "Up next", count: upcomingBooks.length },
                            { value: "completed", label: "Finished", count: completedBooks.length },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.value}
                            type="button"
                            role="tab"
                            aria-selected={shelf === tab.value}
                            onClick={() => setLibraryTab(tab.value)}
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                              shelf === tab.value
                                ? "bg-background text-foreground shadow-sm"
                                : "text-muted-foreground hover:text-foreground"
                            )}
                          >
                            {tab.label}
                            <span className="ml-1 tabular-nums opacity-70">
                              {tab.count}
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {shelfBooks.length === 0 ? (
                      <Card className="p-5 text-sm text-muted-foreground">
                        {shelf === "upcoming"
                          ? "Nothing lined up next yet."
                          : "No finished books yet."}
                      </Card>
                    ) : (
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {shelfBooks.map((book) => (
                          <BookCard
                            key={book._id}
                            book={book}
                            slug={detail.slug}
                            showStatusControls={showStatusControls}
                            onStatusChange={handleStatusChange}
                            onDelete={deleteHandler(book)}
                            muted={shelf === "completed"}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                )}
              </>
            )}
          </div>
        )}

        <Dialog
          open={pendingDelete !== null}
          onOpenChange={(open) => {
            if (!open) setPendingDelete(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete community book?</DialogTitle>
              <DialogDescription>
                &quot;{pendingDelete?.bookName}&quot; and its reading schedule
                will be permanently deleted. Members who are already tracking
                this book keep their personal copy.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setPendingDelete(null)}
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

        <Dialog
          open={activeConflict !== null}
          onOpenChange={(open) => {
            if (!open) setActiveConflict(null);
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Replace the current read?</DialogTitle>
              <DialogDescription>
                &quot;{activeConflict?.currentActiveName}&quot; is the active
                book right now. Making &quot;{activeConflict?.bookName}&quot;
                active will mark &quot;{activeConflict?.currentActiveName}&quot;
                as completed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setActiveConflict(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (!activeConflict) return;
                  const book = books.find(
                    (candidate) => candidate._id === activeConflict.bookId
                  );
                  if (book) {
                    void handleStatusChange(book, "active", true);
                  }
                }}
              >
                Complete it and switch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </CommunityThemeProvider>
  );
}

const ROLE_LABELS: Record<NonNullable<CommunityDetail["viewerRole"]>, string> = {
  owner: "You're the owner",
  admin: "You're an admin",
  moderator: "You're a moderator",
  member: "You're a member",
};

const HERO_CHIP =
  "inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-2.5 py-1";

function HeroStat({ value, label }: { value: number; label: string }) {
  return (
    <div className="px-2 py-3 text-center">
      <p className="text-lg font-bold tabular-nums leading-tight text-foreground">
        {value}
      </p>
      <p className="text-[11px] text-muted-foreground sm:text-xs">{label}</p>
    </div>
  );
}

function SectionHeading({
  id,
  title,
  flush = false,
}: {
  id: string;
  title: string;
  flush?: boolean;
}) {
  return (
    <h2
      id={id}
      className={cn(
        "flex items-center gap-2 text-lg font-semibold text-foreground",
        !flush && "mb-3"
      )}
    >
      <span
        className="inline-block h-4 w-1 rounded-full"
        style={{ backgroundColor: "var(--brand)" }}
        aria-hidden="true"
      />
      {title}
    </h2>
  );
}

// lucide-react has no TikTok glyph, so we render a small inline SVG.
function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M16.5 3a5.6 5.6 0 0 0 4.5 4.5v2.9a8.4 8.4 0 0 1-4.5-1.35v6.15a5.9 5.9 0 1 1-5.9-5.9c.2 0 .4 0 .6.03v3.02a2.9 2.9 0 1 0 2 2.75V3h3.2Z" />
    </svg>
  );
}

function SocialLinks({
  instagramUrl,
  tiktokUrl,
  websiteUrl,
}: {
  instagramUrl?: string;
  tiktokUrl?: string;
  websiteUrl?: string;
}) {
  const links = [
    { url: instagramUrl, label: "Instagram", Icon: Instagram },
    { url: tiktokUrl, label: "TikTok", Icon: TikTokIcon },
    { url: websiteUrl, label: "Website", Icon: Globe },
  ].filter((link): link is { url: string; label: string; Icon: typeof Globe } =>
    Boolean(link.url)
  );

  if (links.length === 0) return null;

  return (
    <>
      {links.map(({ url, label, Icon }) => (
        <a
          key={label}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={cn(HERO_CHIP, "transition-colors hover:text-foreground")}
        >
          <Icon className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">{label}</span>
        </a>
      ))}
    </>
  );
}

function BookMenu({
  book,
  slug,
  onStatusChange,
  onDelete,
}: {
  book: CommunityBook;
  slug: string;
  onStatusChange: (book: CommunityBook, status: BookStatus) => void;
  onDelete: () => void;
}) {
  const current = bookStatus(book);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant="ghost"
          className="h-8 w-8 p-0 text-muted-foreground"
          aria-label="Book options"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem asChild>
          <Link
            href={`/communities/${slug}/books/${book._id}/edit`}
            className="flex items-center gap-2"
          >
            <Pencil className="h-4 w-4" />
            Edit book
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link
            href={`/communities/${slug}/books/${book._id}/schedule`}
            className="flex items-center gap-2"
          >
            <CalendarDays className="h-4 w-4" />
            Manage schedule
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {current !== "upcoming" && (
          <DropdownMenuItem
            onClick={() => onStatusChange(book, "upcoming")}
          >
            Set to Upcoming
          </DropdownMenuItem>
        )}
        {current !== "active" && (
          <DropdownMenuItem
            onClick={() => onStatusChange(book, "active")}
          >
            Set to Active
          </DropdownMenuItem>
        )}
        {current !== "completed" && (
          <DropdownMenuItem
            onClick={() => onStatusChange(book, "completed")}
          >
            Set to Completed
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={onDelete}
          disabled={current === "active"}
          className="text-destructive focus:text-destructive"
          title={
            current === "active"
              ? "Set the book to Upcoming or Completed before deleting it."
              : undefined
          }
        >
          <Trash2 className="h-4 w-4" />
          Delete book
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function bookMetaLine(book: CommunityBook) {
  const chapterOnly =
    book.progressStyle === "chapters" && book.ignorePages === true;
  const amount = chapterOnly
    ? `${book.totalChapters?.toLocaleString() ?? 0} chapters`
    : `${book.totalPages?.toLocaleString() ?? 0} pages`;
  return `${book.author ? `${book.author} · ` : ""}${amount}`;
}

function bookDateRange(book: CommunityBook) {
  if (book.readingMode !== "calendar") return `${book.daysToRead ?? 0} days`;
  const start = parseDateFromStorage(book.startDate);
  const end = parseDateFromStorage(book.endDate);
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${format(start, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(end, "MMM d, yyyy")}`;
}

/** Where today sits in a calendar-mode book's reading window. */
function bookTimeline(book: CommunityBook) {
  if (book.readingMode !== "calendar") return null;
  const start = parseDateFromStorage(book.startDate);
  const end = parseDateFromStorage(book.endDate);
  const today = startOfDay(new Date());
  const total = differenceInCalendarDays(end, start) + 1;
  if (total <= 0) return null;
  if (today < start) {
    const days = differenceInCalendarDays(start, today);
    return { label: `Starts in ${days} day${days === 1 ? "" : "s"}`, percent: 0 };
  }
  if (today > end) return { label: `Ended ${format(end, "MMM d")}`, percent: 100 };
  const day = differenceInCalendarDays(today, start) + 1;
  return {
    label: `Day ${day} of ${total}`,
    percent: Math.round((day / total) * 100),
  };
}

function BookCover({
  book,
  className,
}: {
  book: CommunityBook;
  className: string;
}) {
  return book.coverImageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={book.coverImageUrl}
      alt={`Cover of ${book.name}`}
      className={cn("rounded-md border border-border object-cover shadow-sm", className)}
    />
  ) : (
    <div
      className={cn("flex items-center justify-center rounded-md border border-border", className)}
      style={{ backgroundColor: "var(--brand-soft)" }}
    >
      <BookOpen className="h-6 w-6 text-muted-foreground" />
    </div>
  );
}

function FeaturedBookCard({
  book,
  slug,
  showStatusControls,
  onStatusChange,
  onDelete,
}: {
  book: CommunityBook;
  slug: string;
  showStatusControls: boolean;
  onStatusChange: (book: CommunityBook, status: BookStatus) => void;
  onDelete?: () => void;
}) {
  const href = `/communities/${slug}/books/${book._id}`;
  const timeline = bookTimeline(book);
  return (
    <div
      className="rounded-xl border p-4 shadow-sm sm:p-5"
      style={{
        background: "linear-gradient(135deg, var(--brand-soft), transparent 80%)",
        borderColor: "var(--brand-border)",
      }}
    >
      <div className="flex gap-4 sm:gap-5">
        <Link href={href} className="shrink-0">
          <BookCover book={book} className="h-36 w-24 sm:h-44 sm:w-[7.5rem]" />
        </Link>
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor: "var(--brand)",
                color: "var(--brand-foreground)",
              }}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />
              Reading now
            </span>
            {showStatusControls && onDelete && (
              <BookMenu
                book={book}
                slug={slug}
                onStatusChange={onStatusChange}
                onDelete={onDelete}
              />
            )}
          </div>
          <Link href={href} className="mt-2">
            <p className="line-clamp-2 text-lg font-bold leading-snug text-foreground hover:underline sm:text-xl">
              {book.name}
            </p>
          </Link>
          <p className="mt-1 truncate text-sm text-muted-foreground">
            {bookMetaLine(book)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            {bookDateRange(book)}
          </p>

          {timeline && (
            <div className="mt-3 max-w-sm">
              <div className="mb-1 flex justify-between text-[11px] font-medium text-muted-foreground">
                <span>{timeline.label}</span>
                <span className="tabular-nums">{timeline.percent}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-background/80">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${timeline.percent}%`,
                    backgroundColor: "var(--brand)",
                  }}
                />
              </div>
            </div>
          )}

          <div className="mt-auto flex flex-wrap gap-2 pt-3">
            <Button
              asChild
              size="sm"
              style={{
                backgroundColor: "var(--brand)",
                color: "var(--brand-foreground)",
              }}
            >
              <Link href={href}>Open book</Link>
            </Button>
            <Button asChild size="sm" variant="outline" className="bg-background/70">
              <Link href={`${href}/reflections`}>
                <MessageSquareText className="h-4 w-4" />
                Reflections
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function BookCard({
  book,
  slug,
  showStatusControls,
  onStatusChange,
  onDelete,
  muted = false,
}: {
  book: CommunityBook;
  slug: string;
  showStatusControls: boolean;
  onStatusChange: (book: CommunityBook, status: BookStatus) => void;
  onDelete?: () => void;
  muted?: boolean;
}) {
  const href = `/communities/${slug}/books/${book._id}`;
  return (
    <Card className="p-3 transition-shadow hover:shadow-md">
      <div className="flex items-start gap-3">
        <Link href={href} className={cn("shrink-0", muted && "opacity-80")}>
          <BookCover book={book} className="h-20 w-14" />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <Link href={href} className="min-w-0">
              <p className="line-clamp-2 font-semibold leading-snug text-foreground hover:underline">
                {book.name}
              </p>
            </Link>
            {showStatusControls && onDelete && (
              <div className="-mr-1 -mt-1">
                <BookMenu
                  book={book}
                  slug={slug}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                />
              </div>
            )}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {bookMetaLine(book)}
          </p>
          {muted && book.completedAt ? (
            <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
              <CheckCircle2 className="h-3 w-3" />
              Finished {format(new Date(book.completedAt), "MMM d, yyyy")}
            </p>
          ) : (
            <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
              <CalendarDays className="h-3 w-3" />
              {bookDateRange(book)}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
