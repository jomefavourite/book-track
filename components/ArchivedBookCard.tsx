"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvexMutation, convexQuery } from "@convex-dev/react-query";
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { format, differenceInDays } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

interface ArchivedBookCardProps {
  book: {
    _id: Id<"books">;
    name: string;
    author?: string;
    totalPages: number;
    readingMode: "calendar" | "fixed-days";
    startDate: string;
    endDate: string;
    startMonth?: string;
    endMonth?: string;
    startYear?: number;
    endYear?: number;
    daysToRead?: number;
    isPublic?: boolean;
  };
  progress?: number;
}

export default function ArchivedBookCard({
  book,
  progress = 0,
}: ArchivedBookCardProps) {
  const { user } = useUser();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const { mutateAsync: deleteBook } = useMutation({
    mutationFn: useConvexMutation(api.books.deleteBook),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, { userId: user?.id || "" })
          .queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getArchivedBooks, {
          userId: user?.id || "",
        }).queryKey,
      });
    },
  });
  const { mutateAsync: unarchiveBook } = useMutation({
    mutationFn: useConvexMutation(api.books.unarchiveBook),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, { userId: user?.id || "" })
          .queryKey,
      });
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getArchivedBooks, {
          userId: user?.id || "",
        }).queryKey,
      });
    },
  });
  const router = useRouter();
  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);

  const handleDelete = async () => {
    if (!user?.id) return;
    try {
      await deleteBook({ bookId: book._id, userId: user.id });
    } catch (error) {
      console.error("Error deleting book:", error);
      alert("Failed to delete book. Please try again.");
    }
  };

  const handleDeleteClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const handleUnarchive = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user?.id) return;
    try {
      await unarchiveBook({ bookId: book._id, userId: user.id });
    } catch (error) {
      console.error("Error unarchiving book:", error);
      alert("Failed to unarchive book. Please try again.");
    }
  };

  return (
    <>
      <Card className="relative p-3 opacity-75 transition-shadow hover:shadow-lg sm:p-4">
        <div className="absolute right-1.5 top-1.5 flex items-center gap-1 sm:right-2 sm:top-2 sm:gap-2">
          <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200 sm:px-2 sm:py-1 sm:text-xs">
            Archived
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleUnarchive}
            className="h-8 w-8 text-muted-foreground hover:text-green-600 dark:hover:text-green-500"
            aria-label="Unarchive book"
            title="Unarchive book"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 sm:h-5 sm:w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M4 3a2 2 0 100 4h12a2 2 0 100-4H4z" />
              <path
                fillRule="evenodd"
                d="M3 8h14v7a2 2 0 01-2 2H5a2 2 0 01-2-2V8zm5 3a1 1 0 011-1h2a1 1 0 110 2H9a1 1 0 01-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleDeleteClick}
            className="h-8 w-8 text-muted-foreground hover:text-red-600 dark:hover:text-red-500"
            aria-label="Delete book"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4 sm:h-5 sm:w-5"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          </Button>
        </div>
        <Link
          href={`/books/${book._id}`}
          className="h-full flex flex-col justify-between pt-5"
        >
          <div>
            <h3 className="mb-2 pr-16 text-lg font-semibold text-foreground sm:pr-20 sm:text-xl">
              {book.name}
            </h3>
            <div className="mb-3 space-y-1 text-xs text-muted-foreground sm:text-sm">
              {book.author && (
                <p className="font-medium text-foreground">by {book.author}</p>
              )}
              <p>{book.totalPages} pages</p>
              <p className="wrap-break-word sm:break-normal">
                {(() => {
                  const days = differenceInDays(endDate, startDate) + 1; // +1 to include both start and end days
                  return `${format(startDate, "MMMM d, yyyy")} - ${format(endDate, "MMMM d, yyyy")} (${days} day${days !== 1 ? "s" : ""})`;
                })()}
              </p>
            </div>
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
    </>
  );
}
