"use client";

import { useMemo } from "react";
import { isAfter, startOfToday } from "date-fns";
import {
  parseDateFromStorage,
  formatDateForStorage,
  getAllDaysInRange,
} from "@/lib/dateUtils";
import {
  calculateCatchUpPages,
  getMissedDays,
  distributePagesAcrossDays,
  distributeChaptersAcrossDays,
} from "@/lib/readingCalculator";
import { Id } from "@/convex/_generated/dataModel";
import {
  getHighestChapterRead,
  isChapterOnlyBook,
} from "@/lib/chapterTracking";

interface CatchUpSuggestionProps {
  bookId: Id<"books">;
  book: {
    startDate: string;
    endDate: string;
    totalPages?: number;
    totalChapters?: number;
    markedCompleteAt?: number;
    progressStyle?: "pages" | "chapters";
    ignorePages?: boolean;
  };
  sessions: Array<{
    date: string;
    isRead: boolean;
    isMissed?: boolean;
    actualPages?: number;
    plannedPages: number;
    chapterNumber?: number | null;
  }>;
}

export default function CatchUpSuggestion({
  book,
  sessions,
}: CatchUpSuggestionProps) {
  const suggestion = useMemo(() => {
    if (book.markedCompleteAt != null) {
      return null;
    }

    const startDate = parseDateFromStorage(book.startDate);
    const endDate = parseDateFromStorage(book.endDate);
    const today = startOfToday();

    if (isAfter(today, endDate)) {
      return null;
    }

    const explicitlyMissedDates = new Set(
      sessions.filter((session) => session.isMissed).map((session) => session.date)
    );
    const completedDates = new Set(
      sessions
        .filter((session) => session.isRead && !session.isMissed)
        .map((session) => session.date)
    );
    const missedDays = getMissedDays(
      startDate,
      endDate,
      completedDates,
      explicitlyMissedDates
    );

    if (missedDays.length === 0) {
      return null;
    }

    const allRemainingDays = getAllDaysInRange(today, endDate);
    const remainingDays = allRemainingDays.filter((day) => {
      const dayKey = formatDateForStorage(day);
      return !explicitlyMissedDates.has(dayKey);
    }).length;

    if (isChapterOnlyBook(book) && typeof book.totalChapters === "number") {
      const currentChapter = getHighestChapterRead(sessions, book.totalChapters);
      const todayKey = formatDateForStorage(today);
      const chapterDistribution = distributeChaptersAcrossDays(
        book.totalChapters,
        startDate,
        endDate
      );
      const expectedChapterByToday = chapterDistribution.get(todayKey) ?? 1;

      if (currentChapter >= expectedChapterByToday) {
        return null;
      }

      const remainingChapters = Math.max(0, book.totalChapters - currentChapter);
      if (remainingDays <= 0) {
        return {
          type: "overdue" as const,
          message: `You have ${remainingChapters} chapter${
            remainingChapters === 1 ? "" : "s"
          } remaining and the reading period has ended.`,
        };
      }

      const suggestedChapter = Math.min(
        book.totalChapters,
        currentChapter + Math.ceil(remainingChapters / remainingDays)
      );

      return {
        type: "catchup" as const,
        message: `You've missed ${missedDays.length} day(s). To catch up, reach Chapter ${suggestedChapter} today.`,
        remainingChapters,
        remainingDays,
      };
    }

    const totalPages = book.totalPages ?? 0;
    const totalPagesRead = sessions.reduce((sum, session) => {
      if (session.isRead) {
        return sum + (session.actualPages || session.plannedPages || 0);
      }
      return sum;
    }, 0);

    const pageDistribution = distributePagesAcrossDays(totalPages, startDate, endDate);
    let expectedPageByToday = 0;
    for (const day of getAllDaysInRange(startDate, endDate)) {
      const dayKey = formatDateForStorage(day);
      const dayPages = pageDistribution.get(dayKey) || 0;
      if (day <= today) {
        expectedPageByToday += dayPages;
      } else {
        break;
      }
    }

    if (totalPagesRead >= expectedPageByToday) {
      return null;
    }

    const totalPagesReadForCatchUp = sessions.reduce((sum, session) => {
      if (session.isRead && !session.isMissed) {
        return sum + (session.actualPages || session.plannedPages);
      }
      return sum;
    }, 0);

    const remainingPages = totalPages - totalPagesReadForCatchUp;

    if (remainingDays <= 0) {
      return {
        type: "overdue" as const,
        message: `You have ${remainingPages} pages remaining and the reading period has ended.`,
      };
    }

    const suggestedPages = calculateCatchUpPages(
      totalPages,
      totalPagesReadForCatchUp,
      remainingDays
    );

    return {
      type: "catchup" as const,
      message: `You've missed ${missedDays.length} day(s). To catch up, read ${suggestedPages} pages today.`,
      remainingPages,
      remainingDays,
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
      {suggestion.type === "catchup" &&
        "remainingPages" in suggestion && (
          <div className="mt-2 text-sm">
            <p>
              Remaining: {suggestion.remainingPages} pages over{" "}
              {suggestion.remainingDays} days
            </p>
          </div>
        )}
      {suggestion.type === "catchup" &&
        "remainingChapters" in suggestion && (
          <div className="mt-2 text-sm">
            <p>
              Remaining: {suggestion.remainingChapters} chapter
              {suggestion.remainingChapters === 1 ? "" : "s"} over{" "}
              {suggestion.remainingDays} days
            </p>
          </div>
        )}
    </div>
  );
}
