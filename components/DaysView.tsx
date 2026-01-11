"use client";

import { useMemo, useState, useEffect } from "react";
import { format, addDays, parseISO } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import { formatDateForStorage, parseDateFromStorage } from "@/lib/dateUtils";
import { calculateDailyPages } from "@/lib/readingCalculator";
import CatchUpSuggestion from "./CatchUpSuggestion";

interface DaysViewProps {
  bookId: Id<"books">;
  book: Pick<
    Doc<"books">,
    "startDate" | "endDate" | "totalPages" | "daysToRead"
  > & {
    [key: string]: any; // Allow additional properties
  };
  canEdit?: boolean;
}

export default function DaysView({
  bookId,
  book,
  canEdit = true,
}: DaysViewProps) {
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
  const [inputValues, setInputValues] = useState<Map<string, string>>(
    new Map()
  );

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
    setInputValues(newInputValues);
  }, [sessions]);

  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);
  const totalDays =
    book.daysToRead ||
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  const pagesPerDay = useMemo(
    () => calculateDailyPages(book.totalPages, totalDays),
    [book.totalPages, totalDays]
  );

  const sessionsMap = useMemo(() => {
    const map = new Map<string, (typeof sessions)[0]>();
    sessions.forEach((session) => {
      map.set(session.date, session);
    });
    return map;
  }, [sessions]);

  const days = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const date = addDays(startDate, i);
      return {
        dayNumber: i + 1,
        date,
        dateKey: formatDateForStorage(date),
      };
    });
  }, [startDate, totalDays]);

  const handleDayToggle = async (dateKey: string) => {
    if (!canEdit || !user?.id) return;
    const existingSession = sessionsMap.get(dateKey);

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
        const actualPages =
          existingSession.actualPages ||
          existingSession.plannedPages ||
          pagesPerDay;
        await redistributePages(dateKey, actualPages, new Set([dateKey]));
      } else if (!newIsRead) {
        // Day marked as unread - redistribute including this day's pages
        // Calculate total pages read excluding this day
        let totalPagesRead = 0;
        days.forEach(({ dateKey: dKey }) => {
          const sess = sessionsMap.get(dKey);
          if (sess?.isRead && dKey !== dateKey) {
            totalPagesRead += sess.actualPages || sess.plannedPages || 0;
          }
        });
        const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
        const unreadDays = days.filter(({ dateKey: dKey }) => {
          const sess = sessionsMap.get(dKey);
          return !sess?.isRead || dKey === dateKey; // Include the toggled day
        });

        if (unreadDays.length > 0) {
          const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
          const remainder = remainingPages % unreadDays.length;

          const updatePromises: Promise<any>[] = [];
          unreadDays.forEach(({ dateKey: dKey }, index) => {
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
        plannedPages: pagesPerDay,
        isRead: true,
      });

      // Redistribute after marking as read
      // Exclude the newly created session from being treated as unread
      await redistributePages(dateKey, pagesPerDay, new Set([dateKey]));
    }
  };

  const redistributePages = async (
    updatedDateKey: string,
    newActualPages: number,
    excludeDateKeys: Set<string> = new Set()
  ) => {
    if (!user?.id) return;

    // Calculate total pages read (including the updated one)
    let totalPagesRead = 0;

    days.forEach(({ dateKey }) => {
      // Skip excluded dateKeys (newly created sessions that should be treated as read)
      if (excludeDateKeys.has(dateKey)) {
        const actualPages = dateKey === updatedDateKey ? newActualPages : 0;
        totalPagesRead += actualPages;
        return;
      }

      const session = sessionsMap.get(dateKey);

      if (session?.isRead) {
        const actualPages =
          dateKey === updatedDateKey
            ? newActualPages
            : session.actualPages || session.plannedPages || 0;
        totalPagesRead += actualPages;
      }
    });

    // Calculate remaining pages and unread days
    const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
    const unreadDays = days.filter(({ dateKey }) => {
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

    unreadDays.forEach(({ dateKey }, index) => {
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

  const handlePagesUpdate = async (dateKey: string, pages: number) => {
    if (!canEdit || !user?.id) return;
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

  const handleInputBlur = async (dateKey: string) => {
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
            (session.actualPages || session.plannedPages || 0).toString()
          );
          return newMap;
        });
      }
      return;
    }

    await handlePagesUpdate(dateKey, pages);
  };

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

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Progress
            </span>
            <span className="text-sm text-muted-foreground">
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {days.map(({ dayNumber, date, dateKey }) => {
            const session = sessionsMap.get(dateKey);
            const isRead = session?.isRead || false;

            return (
              <div
                key={dateKey}
                className={`rounded border p-3 ${
                  isRead
                    ? "border-green-600 bg-green-100 text-green-900 dark:border-green-600 dark:bg-green-900 dark:text-green-50"
                    : "border-border bg-background"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">Day {dayNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(date, "MMM d, yyyy")}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDayToggle(dateKey)}
                    disabled={!canEdit}
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 border-input transition-all sm:h-6 sm:w-6 ${
                      canEdit
                        ? "active:scale-90 cursor-pointer hover:border-primary"
                        : "cursor-not-allowed opacity-50"
                    }`}
                    aria-label={isRead ? "Mark as unread" : "Mark as read"}
                  >
                    {isRead && (
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
                <div className="mb-2 text-xs ">
                  Plan: {session?.plannedPages ?? pagesPerDay} pages
                </div>
                {isRead && (
                  <div>
                    <label className="block text-xs font-medium text-foreground">
                      Actual Pages
                    </label>
                    <input
                      type="number"
                      value={
                        inputValues.get(dateKey) ??
                        (
                          session?.actualPages ||
                          session?.plannedPages ||
                          pagesPerDay
                        ).toString()
                      }
                      onChange={(e) =>
                        handleInputChange(dateKey, e.target.value)
                      }
                      onBlur={() => handleInputBlur(dateKey)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.currentTarget.blur();
                        }
                      }}
                      disabled={!canEdit}
                      min="0"
                      className={`mt-1 w-full rounded border border-input bg-background px-1.5 py-1 text-xs ${
                        canEdit
                          ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                          : "cursor-not-allowed opacity-50"
                      }`}
                    />
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
