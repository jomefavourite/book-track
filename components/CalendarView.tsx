"use client";

import { useState, useMemo } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
  isSameMonth,
  isSameDay,
} from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  formatDateForStorage,
  parseDateFromStorage,
  getDateRangeForMonths,
} from "@/lib/dateUtils";
import { distributePagesAcrossDays } from "@/lib/readingCalculator";
import CatchUpSuggestion from "./CatchUpSuggestion";

interface CalendarViewProps {
  bookId: Id<"books">;
  book: {
    startMonth?: string;
    endMonth?: string;
    startYear?: number;
    endYear?: number;
    startDate: string;
    endDate: string;
    totalPages: number;
  };
}

export default function CalendarView({ bookId, book }: CalendarViewProps) {
  const queryClient = useQueryClient();
  const { data: sessionsQuery, isPending } = useQuery(
    convexQuery(api.readingSessions.getSessionsForBook, { bookId })
  );
  const { mutateAsync: updateSession } = useMutation({
    mutationFn: useConvexMutation(api.readingSessions.updateSession),
    onSuccess: () => {
      // Invalidate and refetch the sessions query for this book
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.readingSessions.getSessionsForBook, {
          bookId,
        }).queryKey,
      });
      // Also invalidate the books list to update progress
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, {}).queryKey,
      });
    },
  });
  const { mutateAsync: createSession } = useMutation({
    mutationFn: useConvexMutation(api.readingSessions.createSession),
    onSuccess: () => {
      // Invalidate and refetch the sessions query for this book
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.readingSessions.getSessionsForBook, {
          bookId,
        }).queryKey,
      });
      // Also invalidate the books list to update progress
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, {}).queryKey,
      });
    },
  });

  // Use empty array as default to ensure hooks are always called
  const sessions = sessionsQuery || [];

  const [currentMonth, setCurrentMonth] = useState(() => {
    const start = parseDateFromStorage(book.startDate);
    return startOfMonth(start);
  });

  const readingPeriod = useMemo(() => {
    if (book.startMonth && book.endMonth && book.startYear && book.endYear) {
      return getDateRangeForMonths(
        book.startMonth,
        book.startYear,
        book.endMonth,
        book.endYear
      );
    }
    return {
      start: parseDateFromStorage(book.startDate),
      end: parseDateFromStorage(book.endDate),
    };
  }, [book]);

  const pageDistribution = useMemo(() => {
    return distributePagesAcrossDays(
      book.totalPages,
      readingPeriod.start,
      readingPeriod.end
    );
  }, [book.totalPages, readingPeriod]);

  const sessionsMap = useMemo(() => {
    const map = new Map<string, (typeof sessions)[0]>();
    sessions.forEach((session) => {
      map.set(session.date, session);
    });
    return map;
  }, [sessions]);

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const monthDays = eachDayOfInterval({ start: monthStart, end: monthEnd });

  // Get the first day of the week for the month (0 = Sunday, 1 = Monday, etc.)
  const startDayOfWeek = monthStart.getDay();

  // Get the last day of the week for the month
  const endDayOfWeek = monthEnd.getDay();

  // Create array with empty cells before the first day of the month
  const calendarDays: (Date | null)[] = [];

  // Add empty cells for days before the month starts
  for (let i = 0; i < startDayOfWeek; i++) {
    calendarDays.push(null);
  }

  // Add all days of the month
  monthDays.forEach((day) => calendarDays.push(day));

  // Add empty cells after the month ends to complete the grid (fill to 6 rows = 42 cells)
  const remainingCells = 42 - calendarDays.length;
  for (let i = 0; i < remainingCells; i++) {
    calendarDays.push(null);
  }

  const isInReadingPeriod = (date: Date) => {
    return date >= readingPeriod.start && date <= readingPeriod.end;
  };

  const handleDayToggle = async (date: Date) => {
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);
    const plannedPages = pageDistribution.get(dateKey) || 0;

    if (existingSession) {
      await updateSession({
        sessionId: existingSession._id,
        isRead: !existingSession.isRead,
        actualPages: existingSession.actualPages,
      });
    } else {
      await createSession({
        bookId,
        date: dateKey,
        plannedPages,
        isRead: true,
      });
    }
  };

  const handlePagesUpdate = async (date: Date, pages: number) => {
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);

    if (existingSession) {
      await updateSession({
        sessionId: existingSession._id,
        isRead: existingSession.isRead,
        actualPages: pages,
      });
    }
  };

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentMonth((current) => {
      const newMonth =
        direction === "prev" ? subMonths(current, 1) : addMonths(current, 1);
      return newMonth;
    });
  };

  const canNavigatePrev = currentMonth > readingPeriod.start;
  const canNavigateNext = currentMonth < readingPeriod.end;

  const totalPagesRead = useMemo(() => {
    return sessions.reduce((sum, session) => {
      return (
        sum +
        (session.actualPages || (session.isRead ? session.plannedPages : 0))
      );
    }, 0);
  }, [sessions]);

  const progress = (totalPagesRead / book.totalPages) * 100;

  if (isPending && sessionsQuery === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-zinc-600 dark:text-zinc-400">
          Loading reading sessions...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CatchUpSuggestion
        bookId={bookId}
        book={book}
        sessions={sessions}
      />

      <div className="rounded-lg border border-zinc-200 bg-white p-2 sm:p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="mb-3 sm:mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300 sm:text-sm">
              Progress
            </span>
            <span className="text-xs text-zinc-600 dark:text-zinc-400 sm:text-sm">
              {totalPagesRead} / {book.totalPages} pages ({Math.round(progress)}
              %)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-zinc-900 transition-all dark:bg-zinc-50"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        <div className="mb-3 sm:mb-4 flex items-center justify-between">
          <button
            onClick={() => navigateMonth("prev")}
            disabled={!canNavigatePrev}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-lg font-semibold transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:active:bg-zinc-700 sm:text-xl"
            aria-label="Previous month"
          >
            ←
          </button>
          <h2 className="text-base font-semibold sm:text-xl">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <button
            onClick={() => navigateMonth("next")}
            disabled={!canNavigateNext}
            className="min-h-[44px] min-w-[44px] rounded-lg px-3 py-2 text-lg font-semibold transition-colors hover:bg-zinc-100 active:bg-zinc-200 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-zinc-800 dark:active:bg-zinc-700 sm:text-xl"
            aria-label="Next month"
          >
            →
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-zinc-600 dark:text-zinc-400 sm:text-sm"
            >
              <span className="hidden sm:inline">{day}</span>
              <span className="sm:hidden">{day.slice(0, 1)}</span>
            </div>
          ))}

          {calendarDays.map((day, index) => {
            // Empty cell for days before month starts
            if (day === null) {
              return (
                <div
                  key={`empty-${index}`}
                  className="aspect-square rounded border border-transparent p-1 sm:p-2"
                />
              );
            }

            const dateKey = formatDateForStorage(day);
            const session = sessionsMap.get(dateKey);
            const plannedPages = pageDistribution.get(dateKey) || 0;
            const isInPeriod = isInReadingPeriod(day);
            const isToday = isSameDay(day, new Date());

            if (!isInPeriod) {
              return (
                <div
                  key={dateKey}
                  className="aspect-square rounded border border-zinc-100 bg-zinc-50 p-1 sm:p-2 dark:border-zinc-800 dark:bg-zinc-950"
                >
                  <div className="text-xs text-zinc-400 sm:text-sm">
                    {format(day, "d")}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={dateKey}
                className={`aspect-square rounded border p-1 sm:p-2 transition-colors ${
                  isToday
                    ? "border-zinc-900 bg-zinc-100 dark:border-zinc-50 dark:bg-zinc-800"
                    : session?.isRead
                      ? "border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950"
                      : "border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900"
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between sm:mb-1">
                  <span className="text-xs font-medium sm:text-sm">
                    {format(day, "d")}
                  </span>
                  <button
                    onClick={() => handleDayToggle(day)}
                    className="flex h-5 w-5 items-center justify-center rounded border-2 border-zinc-400 transition-all active:scale-90 sm:h-6 sm:w-6"
                    aria-label={
                      session?.isRead ? "Mark as unread" : "Mark as read"
                    }
                  >
                    {session?.isRead && (
                      <svg
                        className="h-3 w-3 text-green-600 sm:h-4 sm:w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                {session?.isRead && (
                  <div className="space-y-0.5 sm:space-y-1">
                    <div className="text-[10px] text-zinc-600 dark:text-zinc-400 sm:text-xs">
                      Plan: {plannedPages}
                    </div>
                    <input
                      type="number"
                      value={session.actualPages || plannedPages}
                      onChange={(e) =>
                        handlePagesUpdate(day, Number(e.target.value))
                      }
                      min="0"
                      className="w-full rounded border border-zinc-300 px-1 py-0.5 text-[10px] focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-50 dark:focus:border-blue-400 sm:text-xs"
                      placeholder="Pages"
                    />
                  </div>
                )}
                {!session?.isRead && plannedPages > 0 && (
                  <div className="text-[10px] text-zinc-600 dark:text-zinc-400 sm:text-xs">
                    {plannedPages}{" "}
                    <span className="hidden sm:inline">pages</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
