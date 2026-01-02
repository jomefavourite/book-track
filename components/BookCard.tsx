"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useConvexMutation, convexQuery } from "@convex-dev/react-query";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { format } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import DeleteConfirmDialog from "./DeleteConfirmDialog";

interface BookCardProps {
  book: {
    _id: Id<"books">;
    name: string;
    totalPages: number;
    readingMode: "calendar" | "fixed-days";
    startDate: string;
    endDate: string;
    startMonth?: string;
    endMonth?: string;
    startYear?: number;
    endYear?: number;
    daysToRead?: number;
  };
  progress?: number;
}

export default function BookCard({ book, progress = 0 }: BookCardProps) {
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const queryClient = useQueryClient();
  const { mutateAsync: deleteBook } = useMutation({
    mutationFn: useConvexMutation(api.books.deleteBook),
    onSuccess: () => {
      // Invalidate and refetch the books list query
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, {}).queryKey,
      });
    },
  });
  const router = useRouter();
  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);

  const handleDelete = async () => {
    try {
      await deleteBook({ bookId: book._id });
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

  return (
    <>
      <div className="relative rounded-lg border border-zinc-200 bg-white p-4 transition-shadow hover:shadow-lg dark:border-zinc-800 dark:bg-zinc-900">
        <button
          onClick={handleDeleteClick}
          className="absolute cursor-pointer right-2 top-2 rounded p-1 text-zinc-400 transition-colors hover:text-red-600 dark:text-zinc-500 dark:hover:text-red-500"
          aria-label="Delete book"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-5 w-5"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <Link
          href={`/books/${book._id}`}
          className=" h-full flex flex-col justify-between"
        >
          <div>
            <h3 className="mb-2 pr-8 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {book.name}
            </h3>
            <div className="mb-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
              <p>{book.totalPages} pages</p>
              <p>
                {book.readingMode === "calendar"
                  ? book.startMonth && book.endMonth
                    ? `${book.startMonth} ${book.startYear} - ${book.endMonth} ${book.endYear}`
                    : `${format(startDate, "MMM d")} - ${format(endDate, "MMM d, yyyy")}`
                  : `${book.daysToRead} days`}
              </p>
            </div>
          </div>

          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
              <div
                className="h-full bg-zinc-900 transition-all dark:bg-zinc-50"
                style={{ width: `${Math.min(progress, 100)}%` }}
              />
            </div>
          </div>
        </Link>
      </div>

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
