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
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
  const sessionsQueryKey = convexQuery(api.readingSessions.getSessionsForBook, {
    bookId,
  }).queryKey;

  const updateSessionMutation = useConvexMutation(
    api.readingSessions.updateSession
  );
  const { mutateAsync: updateSession } = useMutation({
    mutationFn: updateSessionMutation,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: sessionsQueryKey });

      // Snapshot the previous value
      const previousSessions = queryClient.getQueryData(sessionsQueryKey);

      // Optimistically update the cache
      queryClient.setQueryData(sessionsQueryKey, (old: any) => {
        if (!old) return old;
        return old.map((session: any) => {
          if (session._id === variables.sessionId) {
            return {
              ...session,
              isRead: variables.isRead ?? session.isRead,
              isMissed: variables.isMissed ?? session.isMissed,
              actualPages: variables.actualPages ?? session.actualPages,
              plannedPages: variables.plannedPages ?? session.plannedPages,
            };
          }
          return session;
        });
      });

      // Return context with snapshot value
      return { previousSessions };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousSessions) {
        queryClient.setQueryData(sessionsQueryKey, context.previousSessions);
      }
    },
    onSettled: () => {
      // Always refetch after error or success to ensure consistency
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getBooks, { userId: user.id })
            .queryKey,
        });
      }
    },
  });

  const createSessionMutationFn = useConvexMutation(
    api.readingSessions.createSession
  );
  const { mutateAsync: createSession } = useMutation({
    mutationFn: createSessionMutationFn,
    onMutate: async (
      variables: Parameters<typeof createSessionMutationFn>[0]
    ) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: sessionsQueryKey });

      // Snapshot the previous value
      const previousSessions = queryClient.getQueryData(sessionsQueryKey);

      // Optimistically add the new session (we'll use a temporary ID)
      const tempId = `temp-${Date.now()}`;
      const optimisticSession = {
        _id: tempId as any,
        bookId: variables.bookId,
        userId: variables.userId,
        date: variables.date,
        plannedPages: variables.plannedPages,
        actualPages: variables.actualPages,
        isRead: variables.isRead,
        isMissed: variables.isMissed ?? false,
        createdAt: Date.now(),
      };

      queryClient.setQueryData(sessionsQueryKey, (old: any) => {
        if (!old) return [optimisticSession];
        // Check if session already exists for this date
        const existingIndex = old.findIndex(
          (s: any) => s.date === variables.date
        );
        if (existingIndex >= 0) {
          // Update existing
          const updated = [...old];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...optimisticSession,
            _id: updated[existingIndex]._id, // Keep original ID
          };
          return updated;
        }
        return [...old, optimisticSession];
      });

      return { previousSessions };
    },
    onError: (err, variables, context) => {
      // Rollback on error
      if (context?.previousSessions) {
        queryClient.setQueryData(sessionsQueryKey, context.previousSessions);
      }
    },
    onSettled: () => {
      // Always refetch after error or success
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
      if (user?.id) {
        queryClient.invalidateQueries({
          queryKey: convexQuery(api.books.getBooks, { userId: user.id })
            .queryKey,
        });
      }
    },
  });

  // Use empty array as default to ensure hooks are always called
  // Memoize to prevent creating new array reference on every render
  const sessions = useMemo(() => sessionsQuery || [], [sessionsQuery]);

  // Local state for input values to allow smooth typing
  const [inputValues, setInputValues] = useState<Map<string, string>>(
    new Map()
  );

  // Mobile modal state
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const isMobileModalOpen = selectedDay !== null;

  // Handle day cell click (mobile only)
  const handleDayCellClick = (day: Date, e: React.MouseEvent) => {
    // Only open modal on mobile, and only if clicking the cell itself (not checkboxes or other interactive elements)
    const target = e.target as HTMLElement;
    if (
      window.innerWidth < 640 &&
      target.closest("button") === null &&
      target.tagName !== "INPUT"
    ) {
      setSelectedDay(day);
    }
  };

  // Sync input values with sessions when they change
  useEffect(() => {
    const newInputValues = new Map<string, string>();
    sessions.forEach((session) => {
      if (session.isRead) {
        const value =
          session.actualPages?.toString() ||
          session.plannedPages?.toString() ||
          "";
        newInputValues.set(session.date, value);
      }
    });

    // Only update if the values actually changed to prevent infinite loops
    setInputValues((prev) => {
      // Check if maps are different
      if (prev.size !== newInputValues.size) {
        return newInputValues;
      }
      for (const [key, value] of newInputValues) {
        if (prev.get(key) !== value) {
          return newInputValues;
        }
      }
      // No changes, return previous map to avoid re-render
      return prev;
    });
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
    if (!canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);
    const plannedPages = pageDistribution.get(dateKey) || 0;

    if (existingSession) {
      // If already read, toggle to unrecorded (remove session)
      if (existingSession.isRead) {
        // Update session - optimistic update will handle UI immediately
        updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: false,
          isMissed: false,
          actualPages: existingSession.actualPages,
        }).catch(console.error);
        // Redistribute pages after unmarking as read
        const allDays = getAllDaysInRange(
          readingPeriod.start,
          readingPeriod.end
        );
        let totalPagesRead = 0;
        allDays.forEach((day) => {
          const dKey = formatDateForStorage(day);
          const sess = sessionsMap.get(dKey);
          if (sess?.isRead && !sess?.isMissed && dKey !== dateKey) {
            totalPagesRead += sess.actualPages || sess.plannedPages || 0;
          }
        });
        const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
        const unreadDays = allDays.filter((day) => {
          const dKey = formatDateForStorage(day);
          const sess = sessionsMap.get(dKey);
          return (!sess?.isRead && !sess?.isMissed) || dKey === dateKey;
        });

        if (unreadDays.length > 0) {
          const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
          const remainder = remainingPages % unreadDays.length;

          const updatePromises: Promise<any>[] = [];
          unreadDays.forEach((day, index) => {
            const dKey = formatDateForStorage(day);
            const sess = sessionsMap.get(dKey);
            const newPlannedPages = pagesPerDay + (index < remainder ? 1 : 0);

            if (sess && dKey !== dateKey) {
              updatePromises.push(
                updateSession({
                  sessionId: sess._id,
                  userId: user.id,
                  isRead: false,
                  isMissed: false,
                  plannedPages: newPlannedPages,
                })
              );
            } else if (dKey === dateKey && sess) {
              updatePromises.push(
                updateSession({
                  sessionId: sess._id,
                  userId: user.id,
                  isRead: false,
                  isMissed: false,
                  plannedPages: newPlannedPages,
                })
              );
            }
          });
          await Promise.all(updatePromises);
        }
      } else {
        // Not read - mark as read
        await updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: true,
          isMissed: false,
          actualPages: existingSession.actualPages,
        });
        // Redistribute after marking as read
        const actualPages =
          existingSession.actualPages ||
          existingSession.plannedPages ||
          plannedPages;
        await redistributePages(dateKey, actualPages, new Set([dateKey]));
      }
    } else {
      // No session exists - create one as read
      await createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages,
        isRead: true,
        isMissed: false,
      });

      // Redistribute after marking as read
      await redistributePages(dateKey, plannedPages, new Set([dateKey]));
    }
  };

  const handleMissedToggle = async (date: Date) => {
    if (!canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);
    const plannedPages = pageDistribution.get(dateKey) || 0;

    if (existingSession) {
      // If already missed, toggle to unrecorded
      if (existingSession.isMissed) {
        updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: false,
          isMissed: false,
          actualPages: existingSession.actualPages,
        }).catch(console.error);
        // Redistribute pages after unmarking as missed (non-blocking)
        setTimeout(() => {
          redistributePagesAfterUnread(dateKey).catch(console.error);
        }, 0);
      } else {
        // Not missed - mark as missed
        updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: false,
          isMissed: true,
          actualPages: existingSession.actualPages,
        }).catch(console.error);
        // No redistribution needed when marking as missed - missed days are excluded from redistribution
      }
    } else {
      // No session exists - create one as missed
      createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages,
        isRead: false,
        isMissed: true,
      }).catch(console.error);
      // No redistribution needed when marking as missed - missed days are excluded from redistribution
    }
  };

  const redistributePagesAfterUnread = async (dateKey: string) => {
    if (!user?.id) return;
    const allDays = getAllDaysInRange(readingPeriod.start, readingPeriod.end);
    let totalPagesRead = 0;
    allDays.forEach((day) => {
      const dKey = formatDateForStorage(day);
      const sess = sessionsMap.get(dKey);
      if (sess?.isRead && !sess?.isMissed && dKey !== dateKey) {
        totalPagesRead += sess.actualPages || sess.plannedPages || 0;
      }
    });
    const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
    const unreadDays = allDays.filter((day) => {
      const dKey = formatDateForStorage(day);
      const sess = sessionsMap.get(dKey);
      return (!sess?.isRead && !sess?.isMissed) || dKey === dateKey;
    });

    if (unreadDays.length > 0) {
      const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
      const remainder = remainingPages % unreadDays.length;

      const updatePromises: Promise<any>[] = [];
      unreadDays.forEach((day, index) => {
        const dKey = formatDateForStorage(day);
        const sess = sessionsMap.get(dKey);
        const newPlannedPages = pagesPerDay + (index < remainder ? 1 : 0);

        if (sess && dKey !== dateKey) {
          updatePromises.push(
            updateSession({
              sessionId: sess._id,
              userId: user.id,
              isRead: false,
              isMissed: false,
              plannedPages: newPlannedPages,
            })
          );
        } else if (dKey === dateKey && sess) {
          updatePromises.push(
            updateSession({
              sessionId: sess._id,
              userId: user.id,
              isRead: false,
              isMissed: false,
              plannedPages: newPlannedPages,
            })
          );
        }
      });
      await Promise.all(updatePromises);
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

      // Only count pages from read days (not missed days)
      if (session?.isRead && !session?.isMissed) {
        const actualPages =
          dateKey === updatedDateKey
            ? newActualPages
            : session.actualPages || session.plannedPages || 0;
        totalPagesRead += actualPages;
        readSessions.push({ dateKey, actualPages });
      }
    });

    // Calculate remaining pages and unread days (exclude missed days from redistribution)
    const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
    const unreadDays = allDays.filter((day) => {
      const dateKey = formatDateForStorage(day);
      // Exclude dateKeys that are marked as read (even if not in sessionsMap yet)
      if (excludeDateKeys.has(dateKey)) return false;

      const session = sessionsMap.get(dateKey);
      // Exclude read days and missed days from redistribution
      return !session?.isRead && !session?.isMissed;
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
        // Update existing session's planned pages (only if not missed)
        if (!session.isMissed) {
          updatePromises.push(
            updateSession({
              sessionId: session._id,
              userId: user.id,
              isRead: false,
              isMissed: false,
              plannedPages: newPlannedPages,
            })
          );
        }
      } else {
        // Create new session with new planned pages
        updatePromises.push(
          createSession({
            bookId,
            userId: user.id,
            date: dateKey,
            plannedPages: newPlannedPages,
            isRead: false,
            isMissed: false,
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
          newMap.set(
            dateKey,
            (session?.actualPages || session?.plannedPages || 0).toString()
          );
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
      // Only count pages from read days, exclude missed days
      if (session.isRead && !session.isMissed) {
        return sum + (session.actualPages || session.plannedPages || 0);
      }
      return sum;
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

        <div className="grid grid-cols-7 gap-0.5 sm:gap-2">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div
              key={day}
              className="text-center text-[10px] font-medium text-muted-foreground sm:text-sm"
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
                  className="aspect-square rounded border border-transparent p-0.5 sm:p-2"
                />
              );
            }

            const dateKey = formatDateForStorage(day);
            const session = sessionsMap.get(dateKey);
            // Use session's plannedPages if available (dynamically calculated), otherwise use initial distribution
            const plannedPages =
              session?.plannedPages ?? (pageDistribution.get(dateKey) || 0);
            const isInPeriod = isInReadingPeriod(day);
            const isToday = isSameDay(day, new Date());

            if (!isInPeriod) {
              return (
                <div
                  key={dateKey}
                  className="aspect-square rounded border border-border bg-muted p-0.5 sm:p-2"
                >
                  <div className="text-[10px] text-muted-foreground sm:text-sm">
                    {format(day, "d")}
                  </div>
                </div>
              );
            }

            const isRead = session?.isRead || false;
            const isMissed = session?.isMissed || false;

            return (
              <div
                key={dateKey}
                onClick={(e) => {
                  handleDayCellClick(day, e);
                }}
                className={`relative aspect-square rounded border transition-colors overflow-hidden ${
                  isToday && isRead
                    ? "border-primary bg-green-100 text-green-900 dark:border-primary dark:bg-green-900 dark:text-green-50"
                    : isToday && isMissed
                      ? "border-primary bg-red-100 text-red-900 dark:border-primary dark:bg-red-900 dark:text-red-50"
                      : isToday
                        ? "border-primary bg-primary/10"
                        : isRead
                          ? "border-green-600 bg-green-100 text-green-900 dark:border-green-600 dark:bg-green-900 dark:text-green-50"
                          : isMissed
                            ? "border-red-600 bg-red-100 text-red-900 dark:border-red-600 dark:bg-red-900 dark:text-red-50"
                            : "border-border bg-background"
                } cursor-pointer sm:cursor-default`}
              >
                {/* Mobile Layout - Simplified */}
                <div className="flex h-full flex-col p-0.5 sm:p-2">
                  {/* Top row: Date and Checkboxes */}
                  <div className="flex min-h-0 flex-1 items-start justify-between gap-0.5 sm:mb-1">
                    <span
                      className={`text-[10px] font-semibold leading-tight sm:text-sm ${
                        isRead
                          ? "text-green-900 dark:text-green-50"
                          : isMissed
                            ? "text-red-900 dark:text-red-50"
                            : "text-foreground"
                      }`}
                    >
                      {format(day, "d")}
                    </span>
                    {/* Checkboxes - Stacked vertically on mobile, horizontal on desktop */}
                    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-1">
                      {/* Read Checkbox - only show if not missed */}
                      {!isMissed && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDayToggle(day);
                          }}
                          disabled={!canEdit}
                          className={`hidden sm:flex h-5 w-5 min-w-[20px] items-center justify-center rounded border-2 transition-all sm:h-6 sm:w-6 sm:min-w-[24px] ${
                            isRead
                              ? "border-green-600 bg-green-600"
                              : "border-input bg-background"
                          } ${
                            canEdit
                              ? "active:scale-90 cursor-pointer hover:border-green-600 touch-manipulation"
                              : "cursor-not-allowed opacity-50"
                          }`}
                          aria-label={
                            isRead ? "Mark as unread" : "Mark as read"
                          }
                        >
                          {isRead ? (
                            <svg
                              className="h-3 w-3 text-white sm:h-4 sm:w-4"
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
                          ) : (
                            <svg
                              className="h-3 w-3 text-muted-foreground opacity-30 sm:h-4 sm:w-4"
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
                      )}
                      {/* Missed Checkbox - only show if not read */}
                      {!isRead && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMissedToggle(day);
                          }}
                          disabled={!canEdit}
                          className={`hidden sm:flex h-5 w-5 min-w-[20px] items-center justify-center rounded border-2 transition-all sm:h-6 sm:w-6 sm:min-w-[24px] ${
                            isMissed
                              ? "border-red-600 bg-red-600"
                              : "border-input bg-background"
                          } ${
                            canEdit
                              ? "active:scale-90 cursor-pointer hover:border-red-600 touch-manipulation"
                              : "cursor-not-allowed opacity-50"
                          }`}
                          aria-label={
                            isMissed ? "Mark as not missed" : "Mark as missed"
                          }
                        >
                          {isMissed ? (
                            <svg
                              className="h-3 w-3 text-white sm:h-4 sm:w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          ) : (
                            <svg
                              className="h-3 w-3 text-muted-foreground opacity-30 sm:h-4 sm:w-4"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={3}
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Desktop: Show all info directly in the cell */}
                  <div className="hidden flex-1 flex-col justify-end gap-1 sm:flex">
                    {isRead && (
                      <div className="space-y-1">
                        <div className="text-[10px] text-green-800 dark:text-green-100 sm:text-xs">
                          Plan: {plannedPages} pages
                        </div>
                        <div className="text-[10px] text-green-800 dark:text-green-100 sm:text-xs">
                          Read:{" "}
                          {inputValues.get(dateKey) ??
                            (
                              session?.actualPages || plannedPages
                            ).toString()}{" "}
                          pages
                        </div>
                        {canEdit && (
                          <Input
                            type="number"
                            id="actualPages"
                            value={
                              inputValues.get(dateKey) ??
                              (session?.actualPages || plannedPages).toString()
                            }
                            onChange={(e) => {
                              e.stopPropagation();
                              handleInputChange(dateKey, e.target.value);
                            }}
                            onBlur={(e) => {
                              e.stopPropagation();
                              handleInputBlur(day);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.currentTarget.blur();
                              }
                            }}
                            onClick={(e) => e.stopPropagation()}
                            disabled={!canEdit}
                            min="0"
                            placeholder="Pages"
                            className="h-6 w-full px-1 text-foreground dark:text-foreground text-[10px] sm:h-7 sm:text-xs"
                          />
                        )}
                      </div>
                    )}
                    {isMissed && (
                      <div className="text-[10px] text-red-800 dark:text-red-100 sm:text-xs">
                        Missed
                      </div>
                    )}
                    {!isRead && !isMissed && plannedPages > 0 && (
                      <div className="text-[10px] text-muted-foreground sm:text-xs">
                        {session?.plannedPages || plannedPages}{" "}
                        <span className="hidden sm:inline">pages</span>
                      </div>
                    )}
                  </div>

                  {/* Mobile: Show minimal info at bottom */}
                  <div className="mt-auto flex items-center justify-center sm:hidden">
                    {isRead && (
                      <div className="truncate text-[9px] font-medium text-green-800 dark:text-green-100">
                        <span className="block">
                          Plan:
                          {plannedPages}
                        </span>
                        <span className="block">
                          Read:
                          {inputValues.get(dateKey) ??
                            (
                              session?.actualPages || plannedPages
                            ).toString()}{" "}
                        </span>
                      </div>
                    )}
                    {isMissed && (
                      <div className="truncate text-[9px] font-medium text-red-800 dark:text-red-100">
                        Missed
                      </div>
                    )}
                    {!isRead && !isMissed && plannedPages > 0 && (
                      <div className="truncate text-[9px] text-muted-foreground">
                        {session?.plannedPages || plannedPages} pages
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Mobile Modal for Day Details */}
      <Dialog
        open={isMobileModalOpen}
        onOpenChange={(open: boolean) => {
          if (!open && selectedDay) {
            // Save any pending input changes before closing (non-blocking)
            const dateKey = formatDateForStorage(selectedDay);
            const inputValue = inputValues.get(dateKey);
            
            if (inputValue !== undefined && inputValue !== "") {
              const pages = Number(inputValue);
              if (!isNaN(pages) && pages >= 0) {
                // Save asynchronously without blocking dialog close
                handlePagesUpdate(selectedDay, pages).catch(console.error);
              }
            }
            
            setSelectedDay(null);
          }
        }}
      >
        <DialogContent className="bottom-0 left-0 right-0 top-auto max-h-[85vh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-t-lg border-t sm:hidden data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom">
          {selectedDay && (
            <DayDetailModal
              day={selectedDay}
              session={sessionsMap.get(formatDateForStorage(selectedDay))}
              plannedPages={
                sessionsMap.get(formatDateForStorage(selectedDay))
                  ?.plannedPages ??
                (pageDistribution.get(formatDateForStorage(selectedDay)) || 0)
              }
              isRead={
                sessionsMap.get(formatDateForStorage(selectedDay))?.isRead ||
                false
              }
              isMissed={
                sessionsMap.get(formatDateForStorage(selectedDay))?.isMissed ||
                false
              }
              canEdit={canEdit}
              onReadToggle={() => {
                handleDayToggle(selectedDay);
              }}
              onMissedToggle={() => {
                handleMissedToggle(selectedDay);
              }}
              inputValue={
                inputValues.get(formatDateForStorage(selectedDay)) ??
                (
                  sessionsMap.get(formatDateForStorage(selectedDay))
                    ?.actualPages ||
                  sessionsMap.get(formatDateForStorage(selectedDay))
                    ?.plannedPages ||
                  pageDistribution.get(formatDateForStorage(selectedDay)) ||
                  0
                ).toString()
              }
              onInputChange={(value) =>
                handleInputChange(formatDateForStorage(selectedDay), value)
              }
              onInputBlur={() => handleInputBlur(selectedDay)}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Mobile Day Detail Modal Component
interface DayDetailModalProps {
  day: Date;
  session: any;
  plannedPages: number;
  isRead: boolean;
  isMissed: boolean;
  canEdit: boolean;
  onReadToggle: () => void;
  onMissedToggle: () => void;
  inputValue: string;
  onInputChange: (value: string) => void;
  onInputBlur: () => void;
}

function DayDetailModal({
  day,
  session,
  plannedPages,
  isRead,
  isMissed,
  canEdit,
  onReadToggle,
  onMissedToggle,
  inputValue,
  onInputChange,
  onInputBlur,
}: DayDetailModalProps) {
  return (
    <div className="space-y-6">
      <DialogHeader>
        <DialogTitle className="text-2xl text-foreground">
          {format(day, "EEEE, MMMM d, yyyy")}
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          {isRead
            ? "Marked as read"
            : isMissed
              ? "Marked as missed"
              : "Not yet recorded"}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {/* Status Section */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Status</h3>
          <div className="flex gap-4">
            {/* Read Checkbox */}
            {!isMissed && (
              <button
                onClick={onReadToggle}
                disabled={!canEdit}
                className={`flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-lg border-2 transition-all ${
                  isRead
                    ? "border-green-600 bg-green-600 text-white dark:border-green-500 dark:bg-green-500"
                    : "border-input bg-background text-foreground"
                } ${
                  canEdit
                    ? "active:scale-95 cursor-pointer hover:border-green-600 dark:hover:border-green-500"
                    : "cursor-not-allowed opacity-50"
                }`}
                aria-label={isRead ? "Mark as unread" : "Mark as read"}
              >
                {isRead ? (
                  <svg
                    className="h-6 w-6"
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
                ) : (
                  <svg
                    className="h-6 w-6 text-muted-foreground opacity-30"
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
                <span
                  className={`text-xs font-medium ${isRead ? "text-white" : "text-foreground"}`}
                >
                  Read
                </span>
              </button>
            )}

            {/* Missed Checkbox */}
            {!isRead && (
              <button
                onClick={onMissedToggle}
                disabled={!canEdit}
                className={`flex h-12 w-12 flex-col items-center justify-center gap-1 rounded-lg border-2 transition-all ${
                  isMissed
                    ? "border-red-600 bg-red-600 text-white dark:border-red-500 dark:bg-red-500"
                    : "border-input bg-background text-foreground"
                } ${
                  canEdit
                    ? "active:scale-95 cursor-pointer hover:border-red-600 dark:hover:border-red-500"
                    : "cursor-not-allowed opacity-50"
                }`}
                aria-label={isMissed ? "Mark as not missed" : "Mark as missed"}
              >
                {isMissed ? (
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                ) : (
                  <svg
                    className="h-6 w-6 text-muted-foreground opacity-30"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={3}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                )}
                <span
                  className={`text-xs font-medium ${isMissed ? "text-white" : "text-foreground"}`}
                >
                  Missed
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Pages Section */}
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-foreground">
              Planned Pages
            </label>
            <div className="rounded-lg border border-input bg-muted px-4 py-2 text-lg font-semibold text-foreground">
              {plannedPages} pages
            </div>
          </div>

          {isRead && (
            <div>
              <label className="mb-1 block text-sm font-medium text-foreground">
                Actual Pages Read
              </label>
              <Input
                type="number"
                value={inputValue}
                onChange={(e) => onInputChange(e.target.value)}
                onBlur={onInputBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.currentTarget.blur();
                  }
                }}
                disabled={!canEdit}
                min="0"
                className="w-full px-4 py-3 text-lg font-semibold"
                placeholder="Enter pages"
              />
            </div>
          )}

          {isMissed && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-center dark:border-red-800 dark:bg-red-950">
              <p className="text-sm font-medium text-red-800 dark:text-red-200">
                This day was marked as missed
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
