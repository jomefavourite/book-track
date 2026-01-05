"use client";

import { useMemo } from "react";
import { format, parseISO, isBefore, isAfter, startOfToday } from "date-fns";
import { parseDateFromStorage, getAllDaysInRange } from "@/lib/dateUtils";
import { calculateCatchUpPages, getMissedDays } from "@/lib/readingCalculator";
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

    const completedDates = new Set(
      sessions.filter((s) => s.isRead).map((s) => s.date)
    );

    const missedDays = getMissedDays(startDate, endDate, completedDates);

    if (missedDays.length === 0) {
      return null;
    }

    const totalPagesRead = sessions.reduce((sum, session) => {
      if (session.isRead) {
        return sum + (session.actualPages || session.plannedPages);
      }
      return sum;
    }, 0);

    const remainingPages = book.totalPages - totalPagesRead;
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
      totalPagesRead,
      remainingDays
    );

    return {
      type: "catchup" as const,
      missedDays: missedDays.length,
      remainingPages,
      remainingDays,
      suggestedPages,
      message: `You've missed ${missedDays.length} day(s). To catch up, read ${suggestedPages} pages today.`,
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
        {suggestion.type === "overdue" ? "⚠️ Reading Period Ended" : "📚 Catch-Up Suggestion"}
      </h3>
      <p className="text-sm">{suggestion.message}</p>
      {suggestion.type === "catchup" && (
        <div className="mt-2 text-sm">
          <p>
            Remaining: {suggestion.remainingPages} pages over {suggestion.remainingDays} days
          </p>
        </div>
      )}
    </div>
  );
}

