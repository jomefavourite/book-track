"use client";

import Link from "next/link";
import { Id } from "@/convex/_generated/dataModel";
import { format, differenceInCalendarDays } from "date-fns";
import { parseDateFromStorage } from "@/lib/dateUtils";
import { isChapterOnlyBook } from "@/lib/chapterTracking";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface PublicBookCardProps {
  book: {
    _id: Id<"books">;
    userId?: string;
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
    creatorName?: string;
    creatorEmail?: string;
    /** Owner's profile slug (username), for /user/<slug> links. */
    creatorSlug?: string;
    isPublic?: boolean;
    isArchived?: boolean;
    progressStyle?: "pages" | "chapters";
    ignorePages?: boolean;
    tags?: string[];
  };
  progress?: number;
  /** When true, show "Public" or "Private" badge based on book.isPublic (e.g. on owner's profile). Default false shows "Public" only. */
  showVisibilityBadge?: boolean;
}

export default function PublicBookCard({
  book,
  progress = 0,
  showVisibilityBadge = false,
}: PublicBookCardProps) {
  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);
  const chapterOnlyMode = isChapterOnlyBook(book);

  const isPublic = book.isPublic ?? true;
  const isArchived = book.isArchived ?? false;

  const creatorLabel =
    book.creatorName || book.creatorEmail?.split("@")[0] || "Anonymous";
  const days = differenceInCalendarDays(endDate, startDate) + 1; // +1 to include both start and end days
  const sameYear = startDate.getFullYear() === endDate.getFullYear();
  const metaLine = `${
    chapterOnlyMode
      ? `${book.totalChapters ?? 0} chapters`
      : `${book.totalPages ?? 0} pages`
  } · ${format(startDate, sameYear ? "MMM d" : "MMM d, yyyy")} – ${format(endDate, "MMM d, yyyy")} · ${days} day${days !== 1 ? "s" : ""}`;
  const rounded = Math.min(100, Math.round(progress));

  return (
    <Card className="flex h-full flex-col p-4 transition-shadow hover:shadow-md">
      {/* Same shape as BookCard: status badges on top, then title + one meta line. */}
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        {showVisibilityBadge && isArchived && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900 dark:text-amber-200">
            Archived
          </span>
        )}
        {showVisibilityBadge && !isPublic ? (
          <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
            Private
          </span>
        ) : (
          <span className="rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900 dark:text-green-200">
            Public
          </span>
        )}
        {rounded >= 100 && (
          <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
            Finished
          </span>
        )}
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
            {metaLine}
          </p>
          {book.tags && book.tags.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              {book.tags.map((tag) => (
                <span
                  key={tag}
                  className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] text-primary"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto">
          <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground sm:text-xs">
            <span>Progress</span>
            <span className="tabular-nums">{rounded}%</span>
          </div>
          <Progress value={Math.min(progress, 100)} className="h-2" />
        </div>
      </Link>

      {(book.creatorName || book.creatorEmail) && (
        <div className="mt-3 flex items-center gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold uppercase text-foreground"
            aria-hidden="true"
          >
            {creatorLabel.charAt(0)}
          </span>
          {book.userId ? (
            <Link
              href={`/user/${book.creatorSlug ?? book.userId}`}
              className="truncate font-medium text-foreground hover:underline"
            >
              {creatorLabel}
            </Link>
          ) : (
            <span className="truncate font-medium text-foreground">
              {creatorLabel}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
