"use client";

import { useState, useMemo, useEffect } from "react";
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
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import {
  formatDateForStorage,
  parseDateFromStorage,
  getDateRangeForMonths,
  MONTHS,
  getMonthDateRange,
  getAllDaysInRange,
} from "@/lib/dateUtils";
import { distributePagesAcrossDays } from "@/lib/readingCalculator";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import CatchUpSuggestion from "./CatchUpSuggestion";

interface CalendarViewProps {
  bookId: Id<"books">;
  book: Pick<
    Doc<"books">,
    | "startMonth"
    | "endMonth"
    | "startYear"
    | "endYear"
    | "startDate"
    | "endDate"
    | "totalPages"
  > & {
    [key: string]: any; // Allow additional properties
  };
  canEdit?: boolean;
}

export default function CalendarView({
  bookId,
  book,
  canEdit = true,
}: CalendarViewProps) {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();
  const { data: sessionsQuery, isPending } = useQuery({
    ...convexQuery(api.readingSessions.getSessionsForBook, {
      bookId,
      userId: user?.id,
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
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getBooks, { userId: user.id })
            .queryKey,
        });
      }
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
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getBooks, { userId: user.id })
            .queryKey,
        });
      }
    },
  });

  // Use empty array as default to ensure hooks are always called
  const sessions = sessionsQuery || [];

  // Local state for input values to allow smooth typing
  const [inputValues, setInputValues] = useState<Map<string, string>>(new Map());

  // Sync input values with sessions when they change
  useEffect(() => {
    const newInputValues = new Map<string, string>();
    sessions.forEach((session) => {
      if (session.isRead) {
        const value = session.actualPages?.toString() || session.plannedPages?.toString() || "";
        newInputValues.set(session.date, value);
      }
    });
    setInputValues(newInputValues);
  }, [sessions]);

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
      const newIsRead = !existingSession.isRead;
      await updateSession({
        sessionId: existingSession._id,
        userId: user.id,
        isRead: newIsRead,
        actualPages: existingSession.actualPages,
      });
      
      // Redistribute pages after toggling
      if (newIsRead) {
        // Day marked as read - redistribute remaining pages
        const plannedPages = pageDistribution.get(dateKey) || 0;
        const actualPages = existingSession.actualPages || existingSession.plannedPages || plannedPages;
        await redistributePages(dateKey, actualPages, new Set([dateKey]));
      } else if (!newIsRead) {
        // Day marked as unread - redistribute including this day's pages
        const allDays = getAllDaysInRange(readingPeriod.start, readingPeriod.end);
        let totalPagesRead = 0;
        allDays.forEach((day) => {
          const dKey = formatDateForStorage(day);
          const sess = sessionsMap.get(dKey);
          if (sess?.isRead && dKey !== dateKey) {
            totalPagesRead += (sess.actualPages || sess.plannedPages || 0);
          }
        });
        const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
        const unreadDays = allDays.filter((day) => {
          const dKey = formatDateForStorage(day);
          const sess = sessionsMap.get(dKey);
          return !sess?.isRead || dKey === dateKey; // Include the toggled day
        });
        
        if (unreadDays.length > 0) {
          const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
          const remainder = remainingPages % unreadDays.length;
          
          const updatePromises: Promise<any>[] = [];
          unreadDays.forEach((day, index) => {
            const dKey = formatDateForStorage(day);
            const sess = sessionsMap.get(dKey);
            const newPlannedPages = pagesPerDay + (index < remainder ? 1 : 0);
            
            if (sess) {
              updatePromises.push(
                updateSession({
                  sessionId: sess._id,
                  userId: user.id,
                  isRead: false,
                  plannedPages: newPlannedPages,
                })
              );
            } else if (dKey === dateKey) {
              updatePromises.push(
                createSession({
                  bookId,
                  userId: user.id,
                  date: dKey,
                  plannedPages: newPlannedPages,
                  isRead: false,
                })
              );
            }
          });
          await Promise.all(updatePromises);
        }
      }
    } else {
      await createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages,
        isRead: true,
      });
      
      // Redistribute after marking as read
      // Exclude the newly created session from being treated as unread
      await redistributePages(dateKey, plannedPages, new Set([dateKey]));
    }
  };

  const redistributePages = async (
    updatedDateKey: string,
    newActualPages: number,
    excludeDateKeys: Set<string> = new Set()
  ) => {
    if (!user?.id) return;

    // Get all days in reading period
    const allDays = getAllDaysInRange(readingPeriod.start, readingPeriod.end);
    
    // Calculate total pages read (including the updated one)
    let totalPagesRead = 0;
    const readSessions: Array<{ dateKey: string; actualPages: number }> = [];
    
    allDays.forEach((day) => {
      const dateKey = formatDateForStorage(day);
      
      // Skip excluded dateKeys (newly created sessions that should be treated as read)
      if (excludeDateKeys.has(dateKey)) {
        const actualPages = dateKey === updatedDateKey ? newActualPages : 0;
        totalPagesRead += actualPages;
        return;
      }
      
      const session = sessionsMap.get(dateKey);
      
      if (session?.isRead) {
        const actualPages = dateKey === updatedDateKey 
          ? newActualPages 
          : (session.actualPages || session.plannedPages || 0);
        totalPagesRead += actualPages;
        readSessions.push({ dateKey, actualPages });
      }
    });

    // Calculate remaining pages and unread days
    const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
    const unreadDays = allDays.filter((day) => {
      const dateKey = formatDateForStorage(day);
      // Exclude dateKeys that are marked as read (even if not in sessionsMap yet)
      if (excludeDateKeys.has(dateKey)) return false;
      
      const session = sessionsMap.get(dateKey);
      return !session?.isRead;
    });

    if (unreadDays.length === 0) return;

    // Redistribute remaining pages across unread days
    const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
    const remainder = remainingPages % unreadDays.length;

    // Update planned pages for unread days
    const updatePromises: Promise<any>[] = [];

    unreadDays.forEach((day, index) => {
      const dateKey = formatDateForStorage(day);
      const session = sessionsMap.get(dateKey);
      const newPlannedPages = pagesPerDay + (index < remainder ? 1 : 0);

      if (session) {
        // Update existing session's planned pages
        updatePromises.push(
          updateSession({
            sessionId: session._id,
            userId: user.id,
            isRead: false,
            plannedPages: newPlannedPages,
          })
        );
      } else {
        // Create new session with new planned pages
        updatePromises.push(
          createSession({
            bookId,
            userId: user.id,
            date: dateKey,
            plannedPages: newPlannedPages,
            isRead: false,
          })
        );
      }
    });

    await Promise.all(updatePromises);
  };

  const handleInputChange = (dateKey: string, value: string) => {
    // Update local state immediately for smooth typing
    setInputValues((prev) => {
      const newMap = new Map(prev);
      newMap.set(dateKey, value);
      return newMap;
    });
  };

  const handlePagesUpdate = async (date: Date, pages: number) => {
    if (!canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);

    if (existingSession && existingSession.isRead) {
      // Update the actual pages
      await updateSession({
        sessionId: existingSession._id,
        userId: user.id,
        isRead: existingSession.isRead,
        actualPages: pages,
      });

      // Redistribute pages across unread days
      await redistributePages(dateKey, pages);
    }
  };

  const handleInputBlur = async (date: Date) => {
    const dateKey = formatDateForStorage(date);
    const inputValue = inputValues.get(dateKey);
    
    if (inputValue === undefined || inputValue === "") return;

    const pages = Number(inputValue);
    if (isNaN(pages) || pages < 0) {
      // Reset to original value if invalid
      const session = sessionsMap.get(dateKey);
      if (session) {
        setInputValues((prev) => {
          const newMap = new Map(prev);
          newMap.set(dateKey, (session.actualPages || session.plannedPages || 0).toString());
          return newMap;
        });
      }
      return;
    }

    await handlePagesUpdate(date, pages);
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
        <div className="text-muted-foreground">Loading reading sessions...</div>
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
            // Use session's plannedPages if available (dynamically calculated), otherwise use initial distribution
            const plannedPages = session?.plannedPages ?? (pageDistribution.get(dateKey) || 0);
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
                  isToday && session?.isRead
                    ? "border-primary bg-green-100 text-green-900 dark:border-primary dark:bg-green-900 dark:text-green-50"
                    : isToday
                      ? "border-primary bg-primary/10"
                      : session?.isRead
                        ? "border-green-600 bg-green-100 text-green-900 dark:border-green-600 dark:bg-green-900 dark:text-green-50"
                        : "border-border bg-background"
                }`}
              >
                <div className="mb-0.5 flex items-center justify-between sm:mb-1">
                  <span
                    className={`text-xs font-medium sm:text-sm ${
                      session?.isRead
                        ? "text-green-900 dark:text-green-50"
                        : "text-foreground"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  <button
                    onClick={() => handleDayToggle(day)}
                    disabled={!canEdit}
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all sm:h-6 sm:w-6 ${
                      isToday ? "border-primary/20!" : ""
                    } ${isToday && session?.isRead ? "border-input!" : ""} ${
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
                    <p className="text-[10px] sm:text-xs">Actual pages:</p>
                    <input
                      type="number"
                      value={inputValues.get(dateKey) ?? (session.actualPages || plannedPages).toString()}
                      onChange={(e) => handleInputChange(dateKey, e.target.value)}
                      onBlur={() => handleInputBlur(day)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
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
                {!session?.isRead && (
                  <div className="text-[10px] text-muted-foreground sm:text-xs">
                    {session?.plannedPages || plannedPages}{" "}
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
