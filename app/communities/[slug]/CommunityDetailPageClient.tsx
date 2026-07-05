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
  Lock,
  MoreVertical,
  Pencil,
  Plus,
  Settings,
  ShieldCheck,
  Trash2,
  Users,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import CommunityThemeProvider from "@/components/CommunityThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
    } catch {
      toast({
        title: "Could not update book status",
        variant: "destructive",
      });
    }
  };

  const showStatusControls = canManageBooks(detail?.viewerRole);

  return (
    <CommunityThemeProvider brandColor={detail?.brandColor}>
      <Navigation />
      <main className="mx-auto max-w-6xl p-3 sm:p-6">
        <Button
          variant="ghost"
          asChild
          className="mb-4 px-0"
        >
          <Link href="/communities">
            <ArrowLeft className="h-4 w-4" />
            Communities
          </Link>
        </Button>

        {isPending ? (
          <Card className="p-6 text-muted-foreground">
            Loading community...
          </Card>
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
            <section
              className="overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm"
              style={{ borderColor: "var(--brand-border)" }}
            >
              <div
                className="p-5 sm:p-8"
                style={{
                  background:
                    "linear-gradient(135deg, var(--brand-soft), transparent 70%)",
                }}
              >
                <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-3">
                      {detail.logoUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={detail.logoUrl}
                          alt={`${detail.name} logo`}
                          className="h-12 w-12 rounded-lg object-cover"
                          // style={{ borderColor: "var(--brand)" }}
                        />
                      )}
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

                  <div className="flex flex-col gap-2 sm:flex-row">
                    {canManageBooks(detail.viewerRole) && (
                      <Button
                        asChild
                        style={{
                          backgroundColor: "var(--brand)",
                          color: "var(--brand-foreground)",
                        }}
                      >
                        <Link href={`/communities/${detail.slug}/books/new`}>
                          <Plus className="h-4 w-4" />
                          Add Community Book
                        </Link>
                      </Button>
                    )}
                    {canManageCommunity(detail.viewerRole) && (
                      <>
                        <Button
                          asChild
                          variant="outline"
                        >
                          <Link href={`/communities/${detail.slug}/analytics`}>
                            <BarChart2 className="h-4 w-4" />
                            Analytics
                          </Link>
                        </Button>
                        <Button
                          asChild
                          variant="outline"
                        >
                          <Link href={`/communities/${detail.slug}/settings`}>
                            <Settings className="h-4 w-4" />
                            Settings
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                </div>
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
                  <Card className="p-5 text-sm text-muted-foreground sm:p-6">
                    Loading library...
                  </Card>
                ) : books.length === 0 ? (
                  <Card className="p-5 sm:p-6">
                    <h2 className="text-lg font-semibold text-foreground">
                      Library
                    </h2>
                    <div className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                      No community books yet.
                      {canManageBooks(detail.viewerRole)
                        ? " Add the first shared book for this community."
                        : ""}
                    </div>
                  </Card>
                ) : (
                  <>
                    <Card className="p-5 sm:p-6">
                      <SectionHeading
                        title="Current read"
                        subtitle="The book this community is reading right now."
                      />
                      {activeBooks.length === 0 ? (
                        <div className="mt-4 rounded-md border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
                          No active book.
                          {showStatusControls
                            ? " Set an upcoming book to Active to feature it here."
                            : ""}
                        </div>
                      ) : (
                        <div className="mt-4 space-y-3">
                          {activeBooks.map((book) => (
                            <FeaturedBookCard
                              key={book._id}
                              book={book}
                              slug={detail.slug}
                              showStatusControls={showStatusControls}
                              onStatusChange={handleStatusChange}
                              onDelete={
                                showStatusControls
                                  ? () =>
                                      setPendingDelete({
                                        bookId: book._id,
                                        bookName: book.name,
                                      })
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      )}
                    </Card>

                    {upcomingBooks.length > 0 && (
                      <Card className="p-5 sm:p-6">
                        <SectionHeading
                          title="Upcoming"
                          subtitle="Next up for this community."
                        />
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {upcomingBooks.map((book) => (
                            <BookCard
                              key={book._id}
                              book={book}
                              slug={detail.slug}
                              showStatusControls={showStatusControls}
                              onStatusChange={handleStatusChange}
                              onDelete={
                                showStatusControls
                                  ? () =>
                                      setPendingDelete({
                                        bookId: book._id,
                                        bookName: book.name,
                                      })
                                  : undefined
                              }
                            />
                          ))}
                        </div>
                      </Card>
                    )}

                    {completedBooks.length > 0 && (
                      <Card className="p-5 sm:p-6">
                        <SectionHeading
                          title="Completed"
                          subtitle="Books this community has finished together."
                        />
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                          {completedBooks.map((book) => (
                            <BookCard
                              key={book._id}
                              book={book}
                              slug={detail.slug}
                              showStatusControls={showStatusControls}
                              onStatusChange={handleStatusChange}
                              onDelete={
                                showStatusControls
                                  ? () =>
                                      setPendingDelete({
                                        bookId: book._id,
                                        bookName: book.name,
                                      })
                                  : undefined
                              }
                              muted
                            />
                          ))}
                        </div>
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

function SectionHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-foreground">
        <span
          className="mr-2 inline-block h-4 w-1 rounded-full align-middle"
          style={{ backgroundColor: "var(--brand)" }}
          aria-hidden="true"
        />
        {title}
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
    </div>
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
          className="text-destructive focus:text-destructive"
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
  return `${book.author ? `By ${book.author} • ` : ""}${amount}`;
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
  return (
    <div
      className="rounded-lg border p-4 sm:p-5"
      style={{
        backgroundColor: "var(--brand-soft)",
        borderColor: "var(--brand-border)",
      }}
    >
      <div className="flex gap-4">
        <Link
          href={`/communities/${slug}/books/${book._id}`}
          className="shrink-0"
        >
          {book.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverImageUrl}
              alt={`Cover of ${book.name}`}
              className="h-32 w-24 rounded-md border border-border object-cover shadow-sm"
            />
          ) : (
            <div className="flex h-32 w-24 items-center justify-center rounded-md border border-border bg-background">
              <BookOpen className="h-8 w-8 text-muted-foreground" />
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span
              className="rounded-md px-2 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor: "var(--brand)",
                color: "var(--brand-foreground)",
              }}
            >
              Active
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
          <Link href={`/communities/${slug}/books/${book._id}`}>
            <p className="mt-2 text-lg font-bold text-foreground hover:underline">
              {book.name}
            </p>
          </Link>
          <p className="mt-1 text-sm text-muted-foreground">
            {bookMetaLine(book)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {book.readingMode === "calendar"
              ? `${book.startDate} to ${book.endDate}`
              : `${book.daysToRead ?? 0} days`}
          </p>
          <Button
            asChild
            size="sm"
            className="mt-3"
            style={{
              backgroundColor: "var(--brand)",
              color: "var(--brand-foreground)",
            }}
          >
            <Link href={`/communities/${slug}/books/${book._id}`}>
              Open book
            </Link>
          </Button>
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
  return (
    <div
      className={`rounded-md border border-border p-4 transition-colors hover:bg-muted/50 ${
        muted ? "opacity-75" : ""
      }`}
    >
      <div className="flex items-start gap-3">
        <Link
          href={`/communities/${slug}/books/${book._id}`}
          className="shrink-0"
        >
          {book.coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={book.coverImageUrl}
              alt={`Cover of ${book.name}`}
              className="h-20 w-14 rounded-md border border-border object-cover"
            />
          ) : (
            <div className="flex h-20 w-14 items-center justify-center rounded-md bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-1">
            <Link href={`/communities/${slug}/books/${book._id}`}>
              <p className="font-semibold text-foreground hover:underline">
                {book.name}
              </p>
            </Link>
            {showStatusControls && onDelete && (
              <BookMenu
                book={book}
                slug={slug}
                onStatusChange={onStatusChange}
                onDelete={onDelete}
              />
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {bookMetaLine(book)}
          </p>
          {muted && book.completedAt ? (
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Finished {new Date(book.completedAt).toLocaleDateString()}
            </p>
          ) : (
            <p className="mt-1 text-xs text-muted-foreground">
              {book.readingMode === "calendar"
                ? `${book.startDate} to ${book.endDate}`
                : `${book.daysToRead ?? 0} days`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
