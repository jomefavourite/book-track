"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvexMutation, convexQuery } from "@convex-dev/react-query";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { format, differenceInCalendarDays } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { isChapterOnlyBook } from "@/lib/chapterTracking";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import DeleteConfirmDialog from "./DeleteConfirmDialog";
import { Archive, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface BookCardProps {
  book: {
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
    tags?: string[];
    communityBookId?: Id<"communityBooks">;
    communityBookStatus?: "upcoming" | "active" | "completed";
  };
  progress?: number;
}

export default function BookCard({ book, progress = 0 }: BookCardProps) {
  const { user } = useUser();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showActiveBlockedDialog, setShowActiveBlockedDialog] = useState(false);
  const queryClient = useQueryClient();
  const { mutateAsync: deleteBook } = useMutation({
    mutationFn: useConvexMutation(api.books.deleteBook),
    onSuccess: () => {
      // Invalidate and refetch the books list query
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, {})
          .queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getArchivedBooks, {}).queryKey,
      });
    },
  });
  const { mutateAsync: archiveBook } = useMutation({
    mutationFn: useConvexMutation(api.books.archiveBook),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, {})
          .queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getArchivedBooks, {}).queryKey,
      });
    },
  });
  const router = useRouter();
  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);
  const chapterOnlyMode = isChapterOnlyBook(book);

  const handleDelete = async () => {
    if (!user?.id) return;
    try {
      await deleteBook({ bookId: book._id });
    } catch (error) {
      console.error("Error deleting book:", error);
      alert("Failed to delete book. Please try again.");
    }
  };

  const handleDeleteClick = (e?: React.SyntheticEvent | Event) => {
    e?.stopPropagation();
    // An active community book can't be deleted — explain why instead.
    if (book.communityBookId && book.communityBookStatus === "active") {
      setShowActiveBlockedDialog(true);
      return;
    }
    setShowDeleteDialog(true);
  };

  const handleArchive = async (e?: React.SyntheticEvent | Event) => {
    e?.stopPropagation();
    if (!user?.id) return;
    try {
      await archiveBook({ bookId: book._id });
    } catch (error) {
      console.error("Error archiving book:", error);
      alert("Failed to archive book. Please try again.");
    }
  };

  return (
    <>
      <Card className="flex flex-col p-4 transition-shadow hover:shadow-md">
        <div className="mb-2 flex items-center justify-between gap-2">
          {book.communityBookId ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              <Users className="h-3 w-3" />
              Community
            </span>
          ) : book.isPublic ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
              Public
            </span>
          ) : (
            <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
              Private
            </span>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mr-2 -mt-1 h-8 w-8 text-muted-foreground"
                aria-label={`Actions for ${book.name}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-40">
              {!book.communityBookId && (
                <DropdownMenuItem
                  onSelect={() => router.push(`/books/${book._id}/edit`)}
                  className="cursor-pointer gap-2"
                >
                  <Pencil className="h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onSelect={() => void handleArchive()}
                className="cursor-pointer gap-2"
              >
                <Archive className="h-4 w-4" />
                Archive
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => handleDeleteClick()}
                className="cursor-pointer gap-2 text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Link
          href={`/books/${book._id}`}
          className="flex flex-1 flex-col justify-between"
        >
          <div>
            <h3 className="line-clamp-2 text-lg font-semibold leading-snug text-card-foreground">
              {book.name}
            </h3>
            {book.author && (
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                by {book.author}
              </p>
            )}
            <p className="mb-3 mt-2 text-xs text-muted-foreground sm:text-sm">
              {(() => {
                const days = differenceInCalendarDays(endDate, startDate) + 1; // +1 to include both start and end days
                const sameYear =
                  startDate.getFullYear() === endDate.getFullYear();
                const amount = chapterOnlyMode
                  ? `${book.totalChapters ?? 0} chapters`
                  : `${book.totalPages ?? 0} pages`;
                return `${amount} · ${format(startDate, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(endDate, "MMM d, yyyy")} · ${days} day${days !== 1 ? "s" : ""}`;
              })()}
            </p>
            {book.tags && book.tags.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {book.tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary sm:text-xs"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-[10px] text-muted-foreground sm:text-xs">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <Progress
              value={Math.min(progress, 100)}
              className="h-2"
            />
          </div>
        </Link>
      </Card>

      <DeleteConfirmDialog
        isOpen={showDeleteDialog}
        onClose={() => setShowDeleteDialog(false)}
        onConfirm={handleDelete}
        title="Delete Book"
        message={`Are you sure you want to delete "${book.name}"? This action cannot be undone and will delete all associated reading sessions.`}
      />

      {showActiveBlockedDialog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={() => setShowActiveBlockedDialog(false)}
        >
          <Card
            className="w-full max-w-md p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-2 text-lg font-semibold text-card-foreground">
              Can&apos;t delete this book
            </h2>
            <p className="mb-6 text-sm text-muted-foreground">
              &quot;{book.name}&quot; is an active community book. It can&apos;t
              be deleted while the community is still reading it. You can archive
              it instead, or delete it once the community book is no longer
              active.
            </p>
            <div className="flex justify-end">
              <Button onClick={() => setShowActiveBlockedDialog(false)}>
                Got it
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
