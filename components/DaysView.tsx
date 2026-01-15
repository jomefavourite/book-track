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
import { Input } from "./ui/input";

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
      // If already read, toggle to unrecorded
      if (existingSession.isRead) {
        updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: false,
          isMissed: false,
          actualPages: existingSession.actualPages,
        }).catch(console.error);
        // Redistribute pages after unmarking as read (non-blocking)
        setTimeout(() => {
          redistributePagesAfterUnread(dateKey).catch(console.error);
        }, 0);
      } else {
        // Not read - mark as read
        updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: true,
          isMissed: false,
          actualPages: existingSession.actualPages,
        }).catch(console.error);
        // Redistribute after marking as read (non-blocking)
        const actualPages =
          existingSession.actualPages ||
          existingSession.plannedPages ||
          pagesPerDay;
        setTimeout(() => {
          redistributePages(dateKey, actualPages, new Set([dateKey])).catch(
            console.error
          );
        }, 0);
      }
    } else {
      createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages: pagesPerDay,
        isRead: true,
        isMissed: false,
      }).catch(console.error);

      // Redistribute after marking as read (non-blocking)
      setTimeout(() => {
        redistributePages(dateKey, pagesPerDay, new Set([dateKey])).catch(
          console.error
        );
      }, 0);
    }
  };

  const handleMissedToggle = async (dateKey: string) => {
    if (!canEdit || !user?.id) return;
    const existingSession = sessionsMap.get(dateKey);

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
        // Redistribute pages after unmarking as missed
        let totalPagesRead = 0;
        days.forEach(({ dateKey: dKey }) => {
          const sess = sessionsMap.get(dKey);
          if (sess?.isRead && !sess?.isMissed && dKey !== dateKey) {
            totalPagesRead += sess.actualPages || sess.plannedPages || 0;
          }
        });
        const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
        const unreadDays = days.filter(({ dateKey: dKey }) => {
          const sess = sessionsMap.get(dKey);
          return (!sess?.isRead && !sess?.isMissed) || dKey === dateKey;
        });

        if (unreadDays.length > 0) {
          const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
          const remainder = remainingPages % unreadDays.length;

          const updatePromises: Promise<any>[] = [];
          unreadDays.forEach(({ dateKey: dKey }, index) => {
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
        // Not missed - mark as missed
        await updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: false,
          isMissed: true,
          actualPages: existingSession.actualPages,
        });
        // No redistribution needed when marking as missed - missed days are excluded from redistribution
        return; // Exit early - no redistribution needed for missed days
      }
    } else {
      // No session exists - create one as missed
      await createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages: pagesPerDay,
        isRead: false,
        isMissed: true,
      });

      // No redistribution needed when marking as missed - missed days are excluded from redistribution
      return; // Exit early - no redistribution needed for missed days
    }
  };

  const redistributePagesAfterUnread = async (dateKey: string) => {
    if (!user?.id) return;
    let totalPagesRead = 0;
    days.forEach(({ dateKey: dKey }) => {
      const sess = sessionsMap.get(dKey);
      if (sess?.isRead && !sess?.isMissed && dKey !== dateKey) {
        totalPagesRead += sess.actualPages || sess.plannedPages || 0;
      }
    });
    const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
    const unreadDays = days.filter(({ dateKey: dKey }) => {
      const sess = sessionsMap.get(dKey);
      return (!sess?.isRead && !sess?.isMissed) || dKey === dateKey;
    });

    if (unreadDays.length > 0) {
      const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
      const remainder = remainingPages % unreadDays.length;

      const updatePromises: Promise<any>[] = [];
      unreadDays.forEach(({ dateKey: dKey }, index) => {
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

      // Only count pages from read days (not missed days)
      if (session?.isRead && !session?.isMissed) {
        const actualPages =
          dateKey === updatedDateKey
            ? newActualPages
            : session.actualPages || session.plannedPages || 0;
        totalPagesRead += actualPages;
      }
    });

    // Calculate remaining pages and unread days (exclude missed days from redistribution)
    const remainingPages = Math.max(0, book.totalPages - totalPagesRead);
    const unreadDays = days.filter(({ dateKey }) => {
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

    unreadDays.forEach(({ dateKey }, index) => {
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
            const isMissed = session?.isMissed || false;

            return (
              <div
                key={dateKey}
                className={`rounded border p-3 ${
                  isRead
                    ? "border-green-600 bg-green-100 text-green-900 dark:border-green-600 dark:bg-green-900 dark:text-green-50"
                    : isMissed
                      ? "border-red-600 bg-red-100 text-red-900 dark:border-red-600 dark:bg-red-900 dark:text-red-50"
                      : "border-border bg-background"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">Day {dayNumber}</div>
                    <div
                      className={`text-xs ${
                        isRead
                          ? "text-green-700 dark:text-green-300"
                          : isMissed
                            ? "text-red-700 dark:text-red-300"
                            : "text-muted-foreground"
                      }`}
                    >
                      {format(date, "MMM d, yyyy")}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Read Checkbox - only show if not missed */}
                    {!isMissed && (
                      <button
                        onClick={() => handleDayToggle(dateKey)}
                        disabled={!canEdit}
                        className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all sm:h-6 sm:w-6 ${
                          isRead
                            ? "border-green-600 bg-green-600"
                            : "border-input"
                        } ${
                          canEdit
                            ? "active:scale-90 cursor-pointer hover:border-green-600"
                            : "cursor-not-allowed opacity-50"
                        }`}
                        aria-label={isRead ? "Mark as unread" : "Mark as read"}
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
                        onClick={() => handleMissedToggle(dateKey)}
                        disabled={!canEdit}
                        className={`flex h-5 w-5 items-center justify-center rounded border-2 transition-all sm:h-6 sm:w-6 ${
                          isMissed
                            ? "border-red-600 bg-red-600"
                            : "border-input"
                        } ${
                          canEdit
                            ? "active:scale-90 cursor-pointer hover:border-red-600"
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
                {!isMissed && (
                  <div className="mb-2 text-xs">
                    Plan: {session?.plannedPages ?? pagesPerDay} pages
                  </div>
                )}
                {isRead && (
                  <div>
                    <label className="block text-xs font-medium text-white">
                      Actual Pages
                    </label>
                    <Input
                      type="number"
                      id="actualPages"
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
                      className={`mt-1 h-6 sm:h-7 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground dark:text-foreground ${
                        canEdit
                          ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                          : "cursor-not-allowed opacity-50"
                      }`}
                    />
                  </div>
                )}
                {isMissed && (
                  <div className="text-xs font-medium text-red-800 dark:text-red-200">
                    Missed
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
