"use client";

import { useMemo } from "react";
import {
  format,
  parseISO,
  isBefore,
  isAfter,
  isToday as isTodayDate,
  startOfToday,
} from "date-fns";
import {
  parseDateFromStorage,
  formatDateForStorage,
  getAllDaysInRange,
} from "@/lib/dateUtils";
import {
  calculateCatchUpPages,
  getMissedDays,
  distributePagesAcrossDays,
} from "@/lib/readingCalculator";
import { Id } from "@/convex/_generated/dataModel";

interface CatchUpSuggestionProps {
  bookId: Id<"books">;
  book: {
    startDate: string;
    endDate: string;
    totalPages: number;
  };
  sessions: Array<{
    date: string;
    isRead: boolean;
    isMissed?: boolean;
    actualPages?: number;
    plannedPages: number;
  }>;
}

export default function CatchUpSuggestion({
  bookId,
  book,
  sessions,
}: CatchUpSuggestionProps) {
  const suggestion = useMemo(() => {
    const startDate = parseDateFromStorage(book.startDate);
    const endDate = parseDateFromStorage(book.endDate);
    const today = startOfToday();

    if (isAfter(today, endDate)) {
      return null;
    }

    // Calculate total pages read (matching progress summary logic - all isRead sessions)
    const totalPagesRead = sessions.reduce((sum, session) => {
      if (session.isRead) {
        return sum + (session.actualPages || session.plannedPages || 0);
      }
      return sum;
    }, 0);

    // Calculate expected page by today
    const pageDistribution = distributePagesAcrossDays(
      book.totalPages,
      startDate,
      endDate
    );

    const allDays = getAllDaysInRange(startDate, endDate);
    let expectedPageByToday = 0;

    for (const day of allDays) {
      const dayKey = formatDateForStorage(day);
      const dayPages = pageDistribution.get(dayKey) || 0;

      if (isBefore(day, today) || isTodayDate(day)) {
        expectedPageByToday += dayPages;
      } else {
        break;
      }
    }

    // If user is ahead or on track, don't show catch-up suggestion
    if (totalPagesRead >= expectedPageByToday) {
      return null;
    }

    // Count explicitly marked missed days
    const explicitlyMissedDays = sessions.filter((s) => s.isMissed).length;

    // Get days that are past and not read (excluding explicitly missed days)
    const completedDates = new Set(
      sessions.filter((s) => s.isRead && !s.isMissed).map((s) => s.date)
    );

    const missedDays = getMissedDays(startDate, endDate, completedDates);

    // Only show catch-up if there are missed days (either explicitly marked or past unread days)
    if (missedDays.length === 0 && explicitlyMissedDays === 0) {
      return null;
    }

    // Calculate total pages read for catch-up calculation (excluding missed days)
    const totalPagesReadForCatchUp = sessions.reduce((sum, session) => {
      // Only count pages from read days, exclude missed days
      if (session.isRead && !session.isMissed) {
        return sum + (session.actualPages || session.plannedPages);
      }
      return sum;
    }, 0);

    const remainingPages = book.totalPages - totalPagesReadForCatchUp;
    const remainingDays = getAllDaysInRange(today, endDate).length;

    if (remainingDays <= 0) {
      return {
        type: "overdue" as const,
        message: `You have ${remainingPages} pages remaining and the reading period has ended.`,
        suggestedPages: remainingPages,
      };
    }

    const suggestedPages = calculateCatchUpPages(
      book.totalPages,
      totalPagesReadForCatchUp,
      remainingDays
    );

    // Count total missed days (explicitly marked + past unread days)
    const totalMissedDays = explicitlyMissedDays + missedDays.length;

    return {
      type: "catchup" as const,
      missedDays: totalMissedDays,
      remainingPages,
      remainingDays,
      suggestedPages,
      message: `You've missed ${totalMissedDays} day(s). To catch up, read ${suggestedPages} pages today.`,
    };
  }, [book, sessions]);

  if (!suggestion) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border p-4 ${
        suggestion.type === "overdue"
          ? "border-red-500 bg-red-100 text-red-900 dark:border-red-600 dark:bg-red-950 dark:text-red-50"
          : "border-amber-500 bg-amber-100 text-amber-900 dark:border-yellow-600 dark:bg-yellow-950 dark:text-yellow-50"
      }`}
    >
      <h3 className="mb-2 font-semibold">
        {suggestion.type === "overdue"
          ? "⚠️ Reading Period Ended"
          : "📚 Catch-Up Suggestion"}
      </h3>
      <p className="text-sm">{suggestion.message}</p>
      {suggestion.type === "catchup" && (
        <div className="mt-2 text-sm">
          <p>
            Remaining: {suggestion.remainingPages} pages over{" "}
            {suggestion.remainingDays} days
          </p>
        </div>
      )}
    </div>
  );
}
