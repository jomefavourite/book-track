"use client";

import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import { format, differenceInDays } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface PublicBookCardProps {
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
    creatorName?: string;
    creatorEmail?: string;
  };
  progress?: number;
}

export default function PublicBookCard({
  book,
  progress = 0,
}: PublicBookCardProps) {
  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);

  return (
    <Card className="relative p-4 transition-shadow hover:shadow-lg">
      <div className="absolute right-2 top-2">
        <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
          Public
        </span>
      </div>
      <Link
        href={`/books/${book._id}`}
        className="flex h-full flex-col justify-between"
      >
        <div>
          <h3 className="mb-2 pr-16 text-xl font-semibold text-card-foreground">
            {book.name}
          </h3>
          <div className="mb-3 space-y-1 text-sm text-muted-foreground">
            {book.author && (
              <p className="font-medium text-foreground">
                by {book.author}
              </p>
            )}
            <p>{book.totalPages} pages</p>
            <p>
              {book.readingMode === "calendar"
                ? (() => {
                    const days = differenceInDays(endDate, startDate) + 1; // +1 to include both start and end days
                    // If month/year values are available, show them; otherwise show actual dates
                    if (book.startMonth && book.endMonth && book.startYear && book.endYear) {
                      return `${book.startMonth} ${book.startYear} - ${book.endMonth} ${book.endYear} (${days} day${days !== 1 ? "s" : ""})`;
                    }
                    return `${format(startDate, "MMM d, yyyy")} - ${format(endDate, "MMM d, yyyy")} (${days} day${days !== 1 ? "s" : ""})`;
                  })()
                : `${book.daysToRead} days`}
            </p>
            {(book.creatorName || book.creatorEmail) && (
              <p className="text-xs italic">
                by{" "}
                {book.creatorName ||
                  book.creatorEmail?.split("@")[0] ||
                  "Anonymous"}
              </p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <Progress value={Math.min(progress, 100)} className="h-2" />
        </div>
      </Link>
    </Card>
  );
}

