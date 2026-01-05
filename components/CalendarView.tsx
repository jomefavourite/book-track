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
import { useUser } from "@clerk/nextjs";
import {
  formatDateForStorage,
  parseDateFromStorage,
  getDateRangeForMonths,
  MONTHS,
  getMonthDateRange,
} from "@/lib/dateUtils";
import { distributePagesAcrossDays } from "@/lib/readingCalculator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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
  canEdit?: boolean;
}

export default function CalendarView({ bookId, book, canEdit = true }: CalendarViewProps) {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();
  const { data: sessionsQuery, isPending } = useQuery({
    ...convexQuery(api.readingSessions.getSessionsForBook, { 
      bookId, 
      userId: user?.id 
    }),
    enabled: true, // Allow querying even without auth (for public books)
  });
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
    // If month/year values are available, use them to initialize the calendar view
    // This shows the calendar starting from the selected month, not the actual start date
    if (book.startMonth && book.startYear) {
      const monthRange = getMonthDateRange(book.startMonth, book.startYear);
      return startOfMonth(monthRange.start);
    }
    // Fall back to actual start date if month/year not available
    const start = parseDateFromStorage(book.startDate);
    return startOfMonth(start);
  });

  const readingPeriod = useMemo(() => {
    // Always prefer actual startDate/endDate over month range for precise date control
    // This ensures that when a specific number of days is selected, only those days are enabled
    return {
      start: parseDateFromStorage(book.startDate),
      end: parseDateFromStorage(book.endDate),
    };
  }, [book]);

  // Calculate navigation boundaries based on selected month range if available
  const navigationBounds = useMemo(() => {
    if (book.startMonth && book.endMonth && book.startYear && book.endYear) {
      const startRange = getMonthDateRange(book.startMonth, book.startYear);
      const endRange = getMonthDateRange(book.endMonth, book.endYear);
      return {
        start: startOfMonth(startRange.start),
        end: endOfMonth(endRange.end),
      };
    }
    // Fall back to actual reading period
    return {
      start: startOfMonth(readingPeriod.start),
      end: endOfMonth(readingPeriod.end),
    };
  }, [book, readingPeriod]);

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
    if (!canEdit) return;
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);
    const plannedPages = pageDistribution.get(dateKey) || 0;

    if (!user?.id) return;

    if (existingSession) {
      await updateSession({
        sessionId: existingSession._id,
        userId: user.id,
        isRead: !existingSession.isRead,
        actualPages: existingSession.actualPages,
      });
    } else {
      await createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages,
        isRead: true,
      });
    }
  };

  const handlePagesUpdate = async (date: Date, pages: number) => {
    if (!canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);

    if (existingSession) {
      await updateSession({
        sessionId: existingSession._id,
        userId: user.id,
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

  const canNavigatePrev = currentMonth > navigationBounds.start;
  const canNavigateNext = currentMonth < navigationBounds.end;

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
        <div className="text-muted-foreground">
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

      <Card className="p-2 sm:p-4">
        <div className="mb-3 sm:mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-foreground sm:text-sm">
              Progress
            </span>
            <span className="text-xs text-muted-foreground sm:text-sm">
              {totalPagesRead} / {book.totalPages} pages ({Math.round(progress)}
              %)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        <div className="mb-3 sm:mb-4 flex items-center justify-between">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth("prev")}
            disabled={!canNavigatePrev}
            className="min-h-[44px] min-w-[44px] text-lg font-semibold sm:text-xl"
            aria-label="Previous month"
          >
            ←
          </Button>
          <h2 className="text-base font-semibold sm:text-xl">
            {format(currentMonth, "MMMM yyyy")}
          </h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateMonth("next")}
            disabled={!canNavigateNext}
            className="min-h-[44px] min-w-[44px] text-lg font-semibold sm:text-xl"
            aria-label="Next month"
          >
            →
          </Button>
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="text-center text-xs font-medium text-muted-foreground sm:text-sm"
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
                  className="aspect-square rounded border border-border bg-muted p-1 sm:p-2"
                >
                  <div className="text-xs text-muted-foreground sm:text-sm">
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
                    ? "border-primary bg-primary/10"
                    : session?.isRead
                      ? "border-green-600 bg-green-100 text-green-900 dark:border-green-600 dark:bg-green-900 dark:text-green-50"
                      : "border-border bg-background"
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between sm:mb-1">
                  <span className={`text-xs font-medium sm:text-sm ${
                    session?.isRead 
                      ? "text-green-900 dark:text-green-50" 
                      : "text-foreground"
                  }`}>
                    {format(day, "d")}
                  </span>
                  <button
                    onClick={() => handleDayToggle(day)}
                    disabled={!canEdit}
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 border-input transition-all sm:h-6 sm:w-6 ${
                      canEdit
                        ? "active:scale-90 cursor-pointer hover:border-primary"
                        : "cursor-not-allowed opacity-50"
                    }`}
                    aria-label={
                      session?.isRead ? "Mark as unread" : "Mark as read"
                    }
                  >
                      {session?.isRead && (
                        <svg
                          className="h-3 w-3 text-green-700 dark:text-green-400 sm:h-4 sm:w-4"
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
                    <div className="text-[10px] text-green-800 dark:text-green-100 sm:text-xs">
                      Plan: {plannedPages}
                    </div>
                    <input
                      type="number"
                      value={session.actualPages || plannedPages}
                      onChange={(e) =>
                        handlePagesUpdate(day, Number(e.target.value))
                      }
                      disabled={!canEdit}
                      min="0"
                      className={`w-full rounded border border-input bg-background px-1 py-0.5 text-[10px] text-foreground sm:text-xs ${
                        canEdit
                          ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                          : "cursor-not-allowed opacity-50"
                      }`}
                      placeholder="Pages"
                    />
                  </div>
                )}
                {!session?.isRead && plannedPages > 0 && (
                  <div className="text-[10px] text-muted-foreground sm:text-xs">
                    {plannedPages}{" "}
                    <span className="hidden sm:inline">pages</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
