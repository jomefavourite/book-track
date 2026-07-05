"use client";

import { useState, useMemo, useEffect } from "react";
import {
  format,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addMonths,
  subMonths,
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
  getAllDaysInRange,
  getMonthDateRange,
  formatTimerDuration,
  formatCountdown,
} from "@/lib/dateUtils";
import { BookOpenText, Timer } from "lucide-react";
import ReadingTimer, { type TimerPhase } from "./ReadingTimer";
import ReflectionNoteEditor from "./ReflectionNoteEditor";
import { playTimerEndSound } from "@/lib/timerSound";
import {
  distributePagesAcrossDays,
  distributeChaptersAcrossDays,
} from "@/lib/readingCalculator";
import {
  getHighestChapterRead,
  isChapterOnlyBook,
} from "@/lib/chapterTracking";
import {
  computeChapterSuggestions,
  getDisplayTargetChapterForDate,
  getReadChapterForDate,
  getTargetChapterForDate,
} from "@/lib/chapterPlanning";
import {
  calculatePagesCoveredFromStopPage,
  clampStopPageInputValue,
  getDefaultStopPageForDate,
  getInferredStopPageByDate,
  getPreviousStopPage,
  isUnsupportedStopPageError,
} from "@/lib/pageTracking";
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
    | "totalChapters"
    | "progressStyle"
    | "ignorePages"
    | "markedCompleteAt"
    | "resetGeneration"
  > &
    Record<string, unknown>;
  canEdit?: boolean;
}

export default function CalendarView({
  bookId,
  book,
  canEdit = true,
}: CalendarViewProps) {
  const { user } = useUser();
  const queryClient = useQueryClient();
  const chapterMode = (book.progressStyle ?? "pages") === "chapters";
  const chapterOnlyMode = isChapterOnlyBook(book);
  const chapterDropdownMax =
    chapterMode &&
    typeof book.totalChapters === "number" &&
    Number.isInteger(book.totalChapters) &&
    book.totalChapters > 0
      ? book.totalChapters
      : null;
  const useChapterDropdown = chapterDropdownMax !== null;
  const { data: sessionsQuery, isPending } = useQuery({
    ...convexQuery(api.readingSessions.getSessionsForBook, {
      bookId,
      userId: user?.id,
    }),
    enabled: true, // Allow querying even without auth (for public books)
  });
  type ReadingSessionDoc = Doc<"readingSessions">;
  const sessionsQueryKey = convexQuery(api.readingSessions.getSessionsForBook, {
    bookId,
  }).queryKey;

  const updateSessionMutation = useConvexMutation(
    api.readingSessions.updateSession
  );
  const { mutateAsync: updateSessionBase } = useMutation({
    mutationFn: updateSessionMutation,
    onMutate: async (variables) => {
      // Cancel any outgoing refetches to avoid overwriting optimistic update
      await queryClient.cancelQueries({ queryKey: sessionsQueryKey });

      // Snapshot the previous value
      const previousSessions = queryClient.getQueryData(sessionsQueryKey);

      // Optimistically update the cache
      queryClient.setQueryData<ReadingSessionDoc[] | undefined>(
        sessionsQueryKey,
        (old) => {
          if (!old) return old;
          return old.map((session) => {
            if (session._id === variables.sessionId) {
              return {
                ...session,
                isRead: variables.isRead ?? session.isRead,
                isMissed: variables.isMissed ?? session.isMissed,
                actualPages: variables.actualPages ?? session.actualPages,
                stopPage: variables.stopPage ?? session.stopPage,
                plannedPages: variables.plannedPages ?? session.plannedPages,
                chapterNumber:
                  variables.chapterNumber !== undefined
                    ? variables.chapterNumber
                    : session.chapterNumber,
                timerDurationSec:
                  variables.timerDurationSec ?? session.timerDurationSec,
                reflectionNote:
                  variables.reflectionNote !== undefined
                    ? variables.reflectionNote.trim() || undefined
                    : session.reflectionNote,
              };
            }
            return session;
          });
        }
      );

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
  const updateSession = async (
    variables: Parameters<typeof updateSessionMutation>[0]
  ) => {
    try {
      return await updateSessionBase(variables);
    } catch (error) {
      if ("stopPage" in variables && isUnsupportedStopPageError(error)) {
        const fallbackVariables = { ...variables };
        delete fallbackVariables.stopPage;
        return updateSessionBase(fallbackVariables);
      }
      throw error;
    }
  };

  const createSessionMutationFn = useConvexMutation(
    api.readingSessions.createSession
  );
  const { mutateAsync: createSessionBase } = useMutation({
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
      const optimisticSession: ReadingSessionDoc = {
        _id: tempId as Id<"readingSessions">,
        _creationTime: Date.now(),
        bookId: variables.bookId,
        userId: variables.userId,
        date: variables.date,
        plannedPages: variables.plannedPages,
        actualPages: variables.actualPages,
        stopPage: variables.stopPage,
        chapterNumber: variables.chapterNumber,
        reflectionNote: variables.reflectionNote?.trim() || undefined,
        isRead: variables.isRead,
        isMissed: variables.isMissed ?? false,
        createdAt: Date.now(),
        resetGeneration: book.resetGeneration ?? 0,
      };

      queryClient.setQueryData<ReadingSessionDoc[] | undefined>(
        sessionsQueryKey,
        (old) => {
          if (!old) return [optimisticSession];
          // Check if session already exists for this date
          const existingIndex = old.findIndex(
            (session) => session.date === variables.date
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
        }
      );

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
  const createSession = async (
    variables: Parameters<typeof createSessionMutationFn>[0]
  ) => {
    try {
      return await createSessionBase(variables);
    } catch (error) {
      if ("stopPage" in variables && isUnsupportedStopPageError(error)) {
        const fallbackVariables = { ...variables };
        delete fallbackVariables.stopPage;
        return createSessionBase(fallbackVariables);
      }
      throw error;
    }
  };

  // Use empty array as default to ensure hooks are always called
  // Memoize to prevent creating new array reference on every render
  const allSessions = useMemo(() => sessionsQuery || [], [sessionsQuery]);
  const currentGeneration = book.resetGeneration ?? 0;
  // Only the current reading cycle drives the interactive calendar and progress.
  const sessions = useMemo(
    () =>
      allSessions.filter(
        (session) => (session.resetGeneration ?? 0) === currentGeneration
      ),
    [allSessions, currentGeneration]
  );
  // Sessions from previous (reset) cycles — preserved, shown greyed and read-only.
  const staleSessionsMap = useMemo(() => {
    const map = new Map<string, (typeof allSessions)[number]>();
    allSessions.forEach((session) => {
      if ((session.resetGeneration ?? 0) < currentGeneration) {
        map.set(session.date, session);
      }
    });
    return map;
  }, [allSessions, currentGeneration]);
  // Earliest / latest date among stale sessions, so navigation can reach those months.
  const staleDateRange = useMemo(() => {
    let min: string | null = null;
    let max: string | null = null;
    allSessions.forEach((session) => {
      if ((session.resetGeneration ?? 0) < currentGeneration) {
        if (min === null || session.date < min) min = session.date;
        if (max === null || session.date > max) max = session.date;
      }
    });
    return { min, max };
  }, [allSessions, currentGeneration]);

  // Local state for input values to allow smooth typing
  const [inputValues, setInputValues] = useState<Map<string, string>>(
    new Map()
  );
  const [chapterInputValues, setChapterInputValues] = useState<
    Map<string, string>
  >(new Map());

  // Mobile modal state
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [openTimerDateKey, setOpenTimerDateKey] = useState<string | null>(null);

  // Active timer — one at a time, persists across dialog open/close
  const [activeTimerDateKey, setActiveTimerDateKey] = useState<string | null>(
    null
  );
  const [timerPhase, setTimerPhase] = useState<TimerPhase>({ status: "setup" });
  const [timerDisplaySec, setTimerDisplaySec] = useState(0);

  useEffect(() => {
    if (timerPhase.status !== "running") return;
    const { endsAt, totalSec } = timerPhase;
    const id = setInterval(() => {
      const remaining = Math.ceil((endsAt - Date.now()) / 1000);
      if (remaining <= 0) {
        setTimerDisplaySec(0);
        setTimerPhase({ status: "finished", totalSec });
        playTimerEndSound();
      } else {
        setTimerDisplaySec(remaining);
      }
    }, 100);
    return () => clearInterval(id);
  }, [timerPhase]);

  function handleTimerStart(dateKey: string, totalSec: number) {
    setActiveTimerDateKey(dateKey);
    setTimerDisplaySec(totalSec);
    setTimerPhase({
      status: "running",
      endsAt: Date.now() + totalSec * 1000,
      totalSec,
    });
  }

  function handleTimerPause() {
    if (timerPhase.status !== "running") return;
    const remainingSec = Math.ceil((timerPhase.endsAt - Date.now()) / 1000);
    setTimerDisplaySec(remainingSec);
    setTimerPhase({
      status: "paused",
      remainingSec,
      totalSec: timerPhase.totalSec,
    });
  }

  function handleTimerResume() {
    if (timerPhase.status !== "paused") return;
    setTimerPhase({
      status: "running",
      endsAt: Date.now() + timerPhase.remainingSec * 1000,
      totalSec: timerPhase.totalSec,
    });
  }

  function handleTimerReset() {
    setActiveTimerDateKey(null);
    setTimerPhase({ status: "setup" });
    setTimerDisplaySec(0);
  }

  const stopPageByDate = useMemo(
    () => getInferredStopPageByDate(sessions, book.totalPages),
    [sessions, book.totalPages]
  );
  const isMobileModalOpen = selectedDay !== null;
  const [isMobileActionPending, setIsMobileActionPending] = useState(false);

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
    const newChapterValues = new Map<string, string>();
    sessions.forEach((session) => {
      if (session.isRead) {
        const value = stopPageByDate.get(session.date)?.toString() || "";
        newInputValues.set(session.date, value);
        if (chapterMode) {
          newChapterValues.set(
            session.date,
            session.chapterNumber != null ? String(session.chapterNumber) : "1"
          );
        }
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
    setChapterInputValues((prev) => {
      if (prev.size !== newChapterValues.size) {
        return newChapterValues;
      }
      for (const [key, value] of newChapterValues) {
        if (prev.get(key) !== value) {
          return newChapterValues;
        }
      }
      return prev;
    });
  }, [sessions, chapterMode, stopPageByDate]);

  const [currentMonth, setCurrentMonth] = useState(() => {
    const todayMonth = startOfMonth(new Date());

    // Determine month bounds for initialization.
    let startBound: Date;
    let endBound: Date;

    if (book.startMonth && book.endMonth && book.startYear && book.endYear) {
      const startRange = getMonthDateRange(book.startMonth, book.startYear);
      const endRange = getMonthDateRange(book.endMonth, book.endYear);
      startBound = startOfMonth(startRange.start);
      endBound = startOfMonth(endRange.start);
    } else {
      const start = parseDateFromStorage(book.startDate);
      const end = parseDateFromStorage(book.endDate);
      startBound = startOfMonth(start);
      endBound = startOfMonth(end);
    }

    // Open on current month when it's inside the reading period.
    if (todayMonth >= startBound && todayMonth <= endBound) {
      return todayMonth;
    }

    // Otherwise clamp to nearest relevant month.
    if (todayMonth < startBound) return startBound;
    return endBound;
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
    let start: Date;
    let end: Date;
    if (book.startMonth && book.endMonth && book.startYear && book.endYear) {
      const startRange = getMonthDateRange(book.startMonth, book.startYear);
      const endRange = getMonthDateRange(book.endMonth, book.endYear);
      start = startOfMonth(startRange.start);
      end = endOfMonth(endRange.end);
    } else {
      // Fall back to actual reading period
      start = startOfMonth(readingPeriod.start);
      end = endOfMonth(readingPeriod.end);
    }

    // Widen the navigable range to include archived (stale) months from previous
    // reading cycles, so the user can page back to see them.
    if (staleDateRange.min) {
      const staleStart = startOfMonth(parseDateFromStorage(staleDateRange.min));
      if (staleStart < start) start = staleStart;
    }
    if (staleDateRange.max) {
      const staleEnd = endOfMonth(parseDateFromStorage(staleDateRange.max));
      if (staleEnd > end) end = staleEnd;
    }

    return { start, end };
  }, [book, readingPeriod, staleDateRange]);

  const pageDistribution = useMemo(() => {
    if (chapterOnlyMode || typeof book.totalPages !== "number") {
      return new Map<string, number>();
    }
    return distributePagesAcrossDays(
      book.totalPages,
      readingPeriod.start,
      readingPeriod.end
    );
  }, [book.totalPages, readingPeriod, chapterOnlyMode]);

  const chapterDistribution = useMemo(() => {
    if (!chapterOnlyMode || chapterDropdownMax === null) {
      return new Map<string, number>();
    }
    return distributeChaptersAcrossDays(
      chapterDropdownMax,
      readingPeriod.start,
      readingPeriod.end
    );
  }, [chapterOnlyMode, chapterDropdownMax, readingPeriod]);

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

  const readingPeriodDays = useMemo(
    () => getAllDaysInRange(readingPeriod.start, readingPeriod.end),
    [readingPeriod]
  );

  const chapterSuggestions = useMemo(
    () =>
      computeChapterSuggestions(
        readingPeriodDays,
        (dateKey) => sessionsMap.get(dateKey),
        chapterDropdownMax,
        chapterDistribution,
        chapterOnlyMode
      ),
    [
      readingPeriodDays,
      sessionsMap,
      chapterDropdownMax,
      chapterDistribution,
      chapterOnlyMode,
    ]
  );

  const normalizeChapterValue = (value: number) => {
    const normalized = Math.max(1, Math.floor(value));
    return chapterDropdownMax !== null
      ? Math.min(normalized, chapterDropdownMax)
      : normalized;
  };

  const defaultChapterForDate = (dateKey: string) => {
    const raw = chapterInputValues.get(dateKey);
    if (raw === undefined || raw === "") {
      const sessionChapter = sessionsMap.get(dateKey)?.chapterNumber;
      if (sessionChapter !== undefined && sessionChapter !== null) {
        return normalizeChapterValue(sessionChapter);
      }
      return getTargetChapterForDate(
        dateKey,
        chapterSuggestions,
        chapterDistribution
      );
    }
    const n = Number(raw);
    if (isNaN(n) || n < 1) {
      return getTargetChapterForDate(
        dateKey,
        chapterSuggestions,
        chapterDistribution
      );
    }
    return normalizeChapterValue(n);
  };

  const handleChapterUpdate = async (date: Date, chapterNumber: number) => {
    if (!chapterMode || !canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const session = sessionsMap.get(dateKey);
    if (!session?.isRead) return;

    await updateSession({
      sessionId: session._id,
      userId: user.id,
      isRead: session.isRead,
      chapterNumber: normalizeChapterValue(chapterNumber),
    });
  };

  const handleDayToggle = async (date: Date) => {
    if (!canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);
    const plannedPages = chapterOnlyMode
      ? 0
      : pageDistribution.get(dateKey) || 0;

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
        if (!chapterOnlyMode) {
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
          const remainingPages = Math.max(
            0,
            (book.totalPages ?? 0) - totalPagesRead
          );
          const unreadDays = allDays.filter((day) => {
            const dKey = formatDateForStorage(day);
            const sess = sessionsMap.get(dKey);
            return (!sess?.isRead && !sess?.isMissed) || dKey === dateKey;
          });

          if (unreadDays.length > 0) {
            const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
            const remainder = remainingPages % unreadDays.length;

            const updatePromises: Array<Promise<unknown>> = [];
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
        }
      } else {
        // Not read - mark as read
        const markPages = chapterOnlyMode
          ? { actualPages: 0, stopPage: undefined }
          : getDefaultStopPageForDate({
              sessions,
              dateKey,
              plannedPages: existingSession.plannedPages ?? plannedPages,
              totalPages: book.totalPages,
            });
        await updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: true,
          isMissed: false,
          ...(chapterOnlyMode ? {} : markPages),
          ...(chapterMode
            ? { chapterNumber: defaultChapterForDate(dateKey) }
            : {}),
        });
        if (!chapterOnlyMode) {
          // Redistribute after marking as read
          await redistributePages(
            dateKey,
            markPages.actualPages,
            new Set([dateKey])
          );
        }
      }
    } else {
      const markPages = chapterOnlyMode
        ? { actualPages: 0, stopPage: undefined }
        : getDefaultStopPageForDate({
            sessions,
            dateKey,
            plannedPages,
            totalPages: book.totalPages,
          });
      // No session exists - create one as read
      await createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages,
        ...(chapterOnlyMode ? {} : markPages),
        isRead: true,
        isMissed: false,
        ...(chapterMode
          ? { chapterNumber: defaultChapterForDate(dateKey) }
          : {}),
      });

      if (!chapterOnlyMode) {
        // Redistribute after marking as read
        await redistributePages(
          dateKey,
          markPages.actualPages,
          new Set([dateKey])
        );
      }
    }
  };

  const handleMissedToggle = async (date: Date) => {
    if (!canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);
    const plannedPages = chapterOnlyMode
      ? 0
      : pageDistribution.get(dateKey) || 0;

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
    if (chapterOnlyMode) return;
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
    const remainingPages = Math.max(0, (book.totalPages ?? 0) - totalPagesRead);
    const unreadDays = allDays.filter((day) => {
      const dKey = formatDateForStorage(day);
      const sess = sessionsMap.get(dKey);
      return (!sess?.isRead && !sess?.isMissed) || dKey === dateKey;
    });

    if (unreadDays.length > 0) {
      const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
      const remainder = remainingPages % unreadDays.length;

      const updatePromises: Array<Promise<unknown>> = [];
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
    if (chapterOnlyMode) return;
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
    const remainingPages = Math.max(0, (book.totalPages ?? 0) - totalPagesRead);
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
    const updatePromises: Array<Promise<unknown>> = [];

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
    const clampedValue = clampStopPageInputValue(value, book.totalPages);
    // Update local state immediately for smooth typing
    setInputValues((prev) => {
      const newMap = new Map(prev);
      newMap.set(dateKey, clampedValue);
      return newMap;
    });
  };

  const handleChapterInputChange = (dateKey: string, value: string) => {
    setChapterInputValues((prev) => {
      const next = new Map(prev);
      next.set(dateKey, value);
      return next;
    });
  };

  const handleReflectionNoteSave = async (dateKey: string, note: string) => {
    if (!canEdit || !user?.id) return;
    const session = sessionsMap.get(dateKey);
    if (!session?.isRead) return;

    await updateSession({
      sessionId: session._id,
      userId: user.id,
      reflectionNote: note,
    });
  };

  const updateFollowingExplicitStopPages = async (
    updatedDateKey: string,
    updatedStopPage: number
  ) => {
    if (chapterOnlyMode || !user?.id) return;

    let previousStopPage = updatedStopPage;
    const updatePromises: Array<Promise<unknown>> = [];

    getAllDaysInRange(readingPeriod.start, readingPeriod.end)
      .map((day) => formatDateForStorage(day))
      .filter((dateKey) => dateKey > updatedDateKey)
      .forEach((dateKey) => {
        const session = sessionsMap.get(dateKey);
        if (!session?.isRead || session.isMissed) {
          return;
        }

        if (typeof session.stopPage === "number") {
          const next = calculatePagesCoveredFromStopPage({
            stopPage: session.stopPage,
            previousStopPage,
            totalPages: book.totalPages,
          });
          previousStopPage = next.stopPage;
          updatePromises.push(
            updateSession({
              sessionId: session._id,
              userId: user.id,
              actualPages: next.actualPages,
              stopPage: next.stopPage,
            })
          );
          return;
        }

        previousStopPage += session.actualPages ?? session.plannedPages ?? 0;
      });

    await Promise.all(updatePromises);
  };

  const handlePagesUpdate = async (date: Date, stopPageInput: number) => {
    if (chapterOnlyMode) return;
    if (!canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const existingSession = sessionsMap.get(dateKey);

    if (existingSession && existingSession.isRead) {
      const priorStopPage = getPreviousStopPage(
        sessions,
        dateKey,
        book.totalPages
      );
      const pageUpdate = calculatePagesCoveredFromStopPage({
        stopPage: stopPageInput,
        previousStopPage: priorStopPage,
        totalPages: book.totalPages,
      });
      const chapterNumber = chapterMode
        ? defaultChapterForDate(dateKey)
        : undefined;
      await updateSession({
        sessionId: existingSession._id,
        userId: user.id,
        isRead: existingSession.isRead,
        actualPages: pageUpdate.actualPages,
        stopPage: pageUpdate.stopPage,
        ...(chapterMode ? { chapterNumber } : {}),
      });
      await updateFollowingExplicitStopPages(dateKey, pageUpdate.stopPage);

      // Redistribute pages across unread days
      await redistributePages(dateKey, pageUpdate.actualPages);
    }
  };

  const handleInputBlur = async (date: Date) => {
    const dateKey = formatDateForStorage(date);
    const inputValue = inputValues.get(dateKey);

    if (inputValue === undefined || inputValue === "") return;

    const stopPage = Number(inputValue);
    if (isNaN(stopPage) || stopPage < 0) {
      // Reset to original value if invalid
      const session = sessionsMap.get(dateKey);
      if (session) {
        setInputValues((prev) => {
          const newMap = new Map(prev);
          newMap.set(dateKey, (stopPageByDate.get(dateKey) || 0).toString());
          return newMap;
        });
        if (chapterMode) {
          setChapterInputValues((prev) => {
            const newMap = new Map(prev);
            newMap.set(
              dateKey,
              session.chapterNumber != null
                ? String(session.chapterNumber)
                : "1"
            );
            return newMap;
          });
        }
      }
      return;
    }

    await handlePagesUpdate(date, stopPage);
  };

  const handleChapterInputBlur = async (date: Date) => {
    if (!chapterMode || !canEdit || !user?.id) return;
    const dateKey = formatDateForStorage(date);
    const session = sessionsMap.get(dateKey);
    if (!session?.isRead) return;

    const chRaw = chapterInputValues.get(dateKey);
    if (chRaw === undefined || chRaw === "") {
      setChapterInputValues((prev) => {
        const next = new Map(prev);
        next.set(
          dateKey,
          session.chapterNumber != null ? String(session.chapterNumber) : "1"
        );
        return next;
      });
      return;
    }
    const ch = Number(chRaw);
    if (isNaN(ch) || ch < 1) {
      setChapterInputValues((prev) => {
        const next = new Map(prev);
        next.set(
          dateKey,
          session.chapterNumber != null ? String(session.chapterNumber) : "1"
        );
        return next;
      });
      return;
    }

    await handleChapterUpdate(date, ch);
  };

  const handleMobileReadToggle = async (date: Date) => {
    if (isMobileActionPending) return;
    setIsMobileActionPending(true);
    try {
      await handleDayToggle(date);
      // Make sure redistributed planned pages are visible after mobile actions.
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } finally {
      setIsMobileActionPending(false);
    }
  };

  const handleMobileMissedToggle = async (date: Date) => {
    if (isMobileActionPending) return;
    setIsMobileActionPending(true);
    try {
      await handleMissedToggle(date);
      // Make sure redistributed planned pages are visible after mobile actions.
      await queryClient.invalidateQueries({ queryKey: sessionsQueryKey });
    } finally {
      setIsMobileActionPending(false);
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
    if (chapterOnlyMode) {
      if (book.markedCompleteAt != null) {
        return book.totalChapters ?? 0;
      }
      return getHighestChapterRead(sessions, chapterDropdownMax ?? undefined);
    }
    if (book.markedCompleteAt != null) {
      return book.totalPages ?? 0;
    }
    return sessions.reduce((sum, session) => {
      // Only count pages from read days, exclude missed days
      if (session.isRead && !session.isMissed) {
        return sum + (session.actualPages || session.plannedPages || 0);
      }
      return sum;
    }, 0);
  }, [
    sessions,
    book.totalPages,
    book.totalChapters,
    book.markedCompleteAt,
    chapterOnlyMode,
    chapterDropdownMax,
  ]);

  const progress = chapterOnlyMode
    ? chapterDropdownMax
      ? (totalPagesRead / chapterDropdownMax) * 100
      : 0
    : book.totalPages
      ? (totalPagesRead / book.totalPages) * 100
      : 0;

  const getStopPageInputValue = (dateKey: string, plannedPages: number) =>
    (
      stopPageByDate.get(dateKey) ??
      getDefaultStopPageForDate({
        sessions,
        dateKey,
        plannedPages,
        totalPages: book.totalPages,
      }).stopPage
    ).toString();

  const getPagesReadForDate = (
    dateKey: string,
    plannedPages: number,
    session?: ReadingSessionDoc
  ) => {
    const inputValue = inputValues.get(dateKey);
    const stopPageInput = inputValue === undefined ? NaN : Number(inputValue);

    if (!Number.isNaN(stopPageInput) && stopPageInput >= 0) {
      return calculatePagesCoveredFromStopPage({
        stopPage: stopPageInput,
        previousStopPage: getPreviousStopPage(
          sessions,
          dateKey,
          book.totalPages
        ),
        totalPages: book.totalPages,
      }).actualPages;
    }

    return session?.actualPages ?? session?.plannedPages ?? plannedPages;
  };

  if (isPending && sessionsQuery === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">Loading reading sessions...</div>
      </div>
    );
  }

  const renderMobileDayDetail = () => {
    if (!selectedDay) return null;

    const selectedDateKey = formatDateForStorage(selectedDay);
    const selectedSession = sessionsMap.get(selectedDateKey);
    const selectedIsRead = selectedSession?.isRead || false;
    const selectedChapter = getDisplayTargetChapterForDate(
      selectedDateKey,
      selectedSession,
      chapterSuggestions,
      chapterDistribution
    );

    return (
      <DayDetailModal
        day={selectedDay}
        session={selectedSession}
        plannedPages={
          selectedSession?.plannedPages ??
          (pageDistribution.get(selectedDateKey) || 0)
        }
        plannedChapter={selectedChapter}
        isRead={selectedIsRead}
        isMissed={selectedSession?.isMissed || false}
        canEdit={canEdit}
        isActionPending={isMobileActionPending}
        onReadToggle={() => handleMobileReadToggle(selectedDay)}
        onMissedToggle={() => handleMobileMissedToggle(selectedDay)}
        chapterMode={chapterMode}
        chapterOnlyMode={chapterOnlyMode}
        useChapterDropdown={useChapterDropdown}
        chapterMax={chapterDropdownMax ?? undefined}
        chapterValue={String(defaultChapterForDate(selectedDateKey))}
        onChapterChange={(value) =>
          handleChapterInputChange(selectedDateKey, value)
        }
        onChapterSelect={(value) => {
          handleChapterInputChange(selectedDateKey, value);
          void handleChapterUpdate(selectedDay, Number(value));
        }}
        onChapterBlur={() => void handleChapterInputBlur(selectedDay)}
        inputValue={
          inputValues.get(selectedDateKey) ??
          getStopPageInputValue(
            selectedDateKey,
            selectedSession?.plannedPages ??
              (pageDistribution.get(selectedDateKey) || 0)
          )
        }
        maxStopPage={book.totalPages}
        pagesReadToday={getPagesReadForDate(
          selectedDateKey,
          selectedSession?.plannedPages ??
            (pageDistribution.get(selectedDateKey) || 0),
          selectedSession
        )}
        onInputChange={(value) => handleInputChange(selectedDateKey, value)}
        onInputBlur={() => handleInputBlur(selectedDay)}
        reflectionNote={selectedSession?.reflectionNote}
        onReflectionNoteSave={(note) =>
          handleReflectionNoteSave(selectedDateKey, note)
        }
        onTimerOpen={() => {
          setOpenTimerDateKey(selectedDateKey);
          setSelectedDay(null);
        }}
        savedTimerDurationSec={selectedSession?.timerDurationSec}
      />
    );
  };

  const renderActiveTimer = () => {
    if (!openTimerDateKey) return null;

    const timerSession = sessionsMap.get(openTimerDateKey);

    return (
      <ReadingTimer
        open={true}
        onOpenChange={(open) =>
          setOpenTimerDateKey(open ? openTimerDateKey : null)
        }
        dayLabel={format(parseDateFromStorage(openTimerDateKey), "MMM d, yyyy")}
        sessionId={timerSession?._id}
        userId={user?.id ?? ""}
        savedDurationSec={timerSession?.timerDurationSec}
        onSaved={(durationSec) => {
          queryClient.setQueryData<ReadingSessionDoc[]>(
            sessionsQueryKey,
            (old) =>
              old?.map((s) =>
                s._id === timerSession?._id
                  ? { ...s, timerDurationSec: durationSec }
                  : s
              )
          );
        }}
        phase={
          activeTimerDateKey === openTimerDateKey
            ? timerPhase
            : { status: "setup" }
        }
        displaySec={
          activeTimerDateKey === openTimerDateKey ? timerDisplaySec : 0
        }
        onStart={(totalSec) => handleTimerStart(openTimerDateKey, totalSec)}
        onPause={handleTimerPause}
        onResume={handleTimerResume}
        onReset={handleTimerReset}
      />
    );
  };

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
              {chapterOnlyMode
                ? `${totalPagesRead} / ${chapterDropdownMax ?? 0} chapters`
                : `${totalPagesRead} / ${book.totalPages ?? 0} pages`}{" "}
              ({Math.round(progress)}%)
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
            const targetChapter = chapterOnlyMode
              ? getDisplayTargetChapterForDate(
                  dateKey,
                  session,
                  chapterSuggestions,
                  chapterDistribution
                )
              : undefined;
            const readChapter = chapterOnlyMode
              ? getReadChapterForDate(
                  dateKey,
                  session,
                  chapterSuggestions,
                  chapterDistribution,
                  normalizeChapterValue
                )
              : undefined;
            const isInPeriod = isInReadingPeriod(day);
            const isToday = isSameDay(day, new Date());

            if (!isInPeriod) {
              // Show archived (stale) records from a previous reading cycle,
              // greyed out and non-interactive.
              const staleSession = staleSessionsMap.get(dateKey);
              const staleRead = staleSession?.isRead && !staleSession.isMissed;
              const staleMissed = staleSession?.isMissed || false;

              if (staleRead || staleMissed) {
                return (
                  <div
                    key={dateKey}
                    title="Archived from a previous reading cycle (read-only)"
                    className={`aspect-square rounded border p-0.5 opacity-60 sm:p-2 ${
                      staleRead
                        ? "border-green-600/60 bg-green-100/70 text-green-900 dark:border-green-800 dark:bg-green-950/60 dark:text-green-200"
                        : "border-red-600/60 bg-red-100/70 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-medium sm:text-sm">
                        {format(day, "d")}
                      </span>
                      {staleSession?.reflectionNote &&
                        staleSession.reflectionNote.trim().length > 0 && (
                          <BookOpenText
                            className="h-3 w-3 opacity-80"
                            aria-label="Has a reflection note"
                          />
                        )}
                    </div>
                    <div className="mt-0.5 hidden text-[9px] leading-tight sm:block">
                      {staleRead ? "Read" : "Missed"}
                    </div>
                  </div>
                );
              }

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
                      <div className="mb-1">
                        <div className="text-[10px] text-green-800 dark:text-green-100 sm:text-xs">
                          {chapterOnlyMode
                            ? `Target: Chapter ${targetChapter}`
                            : `Plan: ${plannedPages} pages`}
                        </div>
                        <div className="text-[10px] text-green-800 dark:text-green-100 sm:text-xs">
                          {chapterOnlyMode
                            ? `Read: Chapter ${readChapter}`
                            : `Stop: ${
                                chapterMode
                                  ? `Ch ${defaultChapterForDate(dateKey)} · `
                                  : "Page "
                              }${
                                inputValues.get(dateKey) ??
                                getStopPageInputValue(dateKey, plannedPages)
                              }`}
                        </div>
                        {!chapterOnlyMode && (
                          <div className="text-[10px] text-green-800 dark:text-green-100 sm:text-xs">
                            {`Read: ${getPagesReadForDate(
                              dateKey,
                              plannedPages,
                              session
                            )} pages`}
                          </div>
                        )}
                        {canEdit && chapterMode && !chapterOnlyMode && (
                          <div className="flex gap-1">
                            {useChapterDropdown ? (
                              <select
                                value={String(defaultChapterForDate(dateKey))}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleChapterInputChange(
                                    dateKey,
                                    e.target.value
                                  );
                                  void handleChapterUpdate(
                                    day,
                                    Number(e.target.value)
                                  );
                                }}
                                onClick={(e) => e.stopPropagation()}
                                disabled={!canEdit}
                                className="h-6 min-w-0 flex-1 rounded border border-input bg-background px-1 text-[10px] text-foreground dark:text-foreground sm:h-7 sm:text-xs"
                              >
                                {Array.from(
                                  { length: chapterDropdownMax },
                                  (_, index) => index + 1
                                ).map((chapter) => (
                                  <option
                                    key={chapter}
                                    value={chapter}
                                  >
                                    Ch {chapter}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                type="number"
                                inputMode="numeric"
                                value={String(defaultChapterForDate(dateKey))}
                                onChange={(e) => {
                                  e.stopPropagation();
                                  handleChapterInputChange(
                                    dateKey,
                                    e.target.value
                                  );
                                }}
                                onBlur={(e) => {
                                  e.stopPropagation();
                                  void handleChapterInputBlur(day);
                                }}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                  }
                                }}
                                onClick={(e) => e.stopPropagation()}
                                disabled={!canEdit}
                                min="1"
                                placeholder="Ch."
                                className="h-6 min-w-0 flex-1 px-1 text-foreground dark:text-foreground text-[10px] sm:h-7 sm:text-xs"
                              />
                            )}
                            <Input
                              type="number"
                              id="actualPages"
                              value={
                                inputValues.get(dateKey) ??
                                getStopPageInputValue(dateKey, plannedPages)
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
                              max={book.totalPages}
                              placeholder="Stop"
                              className="h-6 w-12 shrink-0 px-1 text-foreground dark:text-foreground text-[10px] sm:h-7 sm:w-14 sm:text-xs"
                            />
                          </div>
                        )}
                        {canEdit &&
                          chapterMode &&
                          chapterOnlyMode &&
                          (useChapterDropdown ? (
                            <select
                              value={String(defaultChapterForDate(dateKey))}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleChapterInputChange(
                                  dateKey,
                                  e.target.value
                                );
                                void handleChapterUpdate(
                                  day,
                                  Number(e.target.value)
                                );
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={!canEdit}
                              className="h-6 w-full rounded border border-input bg-background px-1 text-[10px] text-foreground dark:text-foreground sm:h-7 sm:text-xs"
                            >
                              {Array.from(
                                { length: chapterDropdownMax },
                                (_, index) => index + 1
                              ).map((chapter) => (
                                <option
                                  key={chapter}
                                  value={chapter}
                                >
                                  Chapter {chapter}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={String(defaultChapterForDate(dateKey))}
                              onChange={(e) => {
                                e.stopPropagation();
                                handleChapterInputChange(
                                  dateKey,
                                  e.target.value
                                );
                              }}
                              onBlur={(e) => {
                                e.stopPropagation();
                                void handleChapterInputBlur(day);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                }
                              }}
                              onClick={(e) => e.stopPropagation()}
                              disabled={!canEdit}
                              min="1"
                              placeholder="Ch."
                              className="h-6 w-full px-1 text-foreground dark:text-foreground text-[10px] sm:h-7 sm:text-xs"
                            />
                          ))}
                        {canEdit && !chapterMode && !chapterOnlyMode && (
                          <Input
                            type="number"
                            id="actualPages"
                            value={
                              inputValues.get(dateKey) ??
                              getStopPageInputValue(dateKey, plannedPages)
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
                            max={book.totalPages}
                            placeholder="Stop page"
                            className="h-6 w-full px-1 text-foreground dark:text-foreground text-[10px] sm:h-7 sm:text-xs"
                          />
                        )}
                        {canEdit && (
                          <ReflectionNoteEditor
                            dayLabel={format(day, "MMMM d, yyyy")}
                            note={session?.reflectionNote}
                            canEdit={canEdit}
                            compact
                            onSave={(note) =>
                              handleReflectionNoteSave(dateKey, note)
                            }
                          />
                        )}
                      </div>
                    )}
                    {isMissed && (
                      <div className="text-[10px] text-red-800 dark:text-red-100 sm:text-xs">
                        Missed
                      </div>
                    )}
                    {!isRead &&
                      !isMissed &&
                      (chapterOnlyMode || plannedPages > 0) && (
                        <div className="text-[10px] text-muted-foreground sm:text-xs">
                          {chapterOnlyMode
                            ? `Chapter ${targetChapter}`
                            : `${session?.plannedPages || plannedPages} `}
                          {!chapterOnlyMode && (
                            <span className="hidden sm:inline">pages</span>
                          )}
                        </div>
                      )}
                    {session?.timerDurationSec && !isMissed && !isRead && (
                      <div className="hidden sm:flex items-center gap-0.5 text-[9px] text-muted-foreground">
                        <Timer className="h-2.5 w-2.5" />
                        {formatTimerDuration(session.timerDurationSec)}
                      </div>
                    )}
                    {canEdit && !isRead && !isMissed && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenTimerDateKey(dateKey);
                        }}
                        className="hidden sm:flex items-center gap-0.5 rounded text-muted-foreground transition-colors hover:text-foreground"
                        aria-label="Reading timer"
                      >
                        {activeTimerDateKey === dateKey &&
                        timerPhase.status !== "setup" ? (
                          <span className="inline-flex items-center gap-0.5 font-mono text-[9px]">
                            <Timer className="h-2.5 w-2.5" />
                            {timerPhase.status === "finished"
                              ? "Done!"
                              : formatCountdown(timerDisplaySec)}
                          </span>
                        ) : (
                          <Timer className="h-3 w-3" />
                        )}
                      </button>
                    )}
                  </div>

                  {/* Mobile: Show minimal info at bottom */}
                  <div className="mt-auto flex items-center justify-center sm:hidden">
                    {isRead && (
                      <div className="truncate text-[9px] font-medium text-green-800 dark:text-green-100 leading-2.5">
                        {chapterOnlyMode ? (
                          <>
                            <span className="block">
                              Tg: Ch {targetChapter}
                            </span>
                            <span className="block">Rd: Ch {readChapter}</span>
                          </>
                        ) : (
                          <>
                            <span className="block">{`Plan:${plannedPages}`}</span>
                            <span className="block">
                              {`Stop:${chapterMode ? ` Ch ${defaultChapterForDate(dateKey)} · ` : " "}${
                                inputValues.get(dateKey) ??
                                getStopPageInputValue(dateKey, plannedPages)
                              } `}
                            </span>
                            <span className="block">
                              {`Rd:${getPagesReadForDate(
                                dateKey,
                                plannedPages,
                                session
                              )}p`}
                            </span>
                          </>
                        )}
                      </div>
                    )}
                    {isMissed && (
                      <div className="truncate text-[9px] font-medium text-red-800 dark:text-red-100">
                        Missed
                      </div>
                    )}
                    {!isRead &&
                    !isMissed &&
                    activeTimerDateKey === dateKey &&
                    timerPhase.status !== "setup" ? (
                      <div className="flex items-center gap-0.5 font-mono text-[9px] text-muted-foreground">
                        <Timer className="h-2.5 w-2.5" />
                        {timerPhase.status === "finished"
                          ? "Done!"
                          : formatCountdown(timerDisplaySec)}
                      </div>
                    ) : !isRead &&
                      !isMissed &&
                      (chapterOnlyMode || plannedPages > 0) ? (
                      <div className="truncate text-[9px] text-muted-foreground">
                        {chapterOnlyMode
                          ? `Chapter ${targetChapter}`
                          : `${session?.plannedPages || plannedPages} pages`}
                      </div>
                    ) : null}
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
            if (chapterMode) {
              void handleChapterInputBlur(selectedDay);
            } else {
              const inputValue = inputValues.get(dateKey);

              if (inputValue !== undefined && inputValue !== "") {
                const stopPage = Number(inputValue);
                if (!isNaN(stopPage) && stopPage >= 0) {
                  handlePagesUpdate(selectedDay, stopPage).catch(console.error);
                }
              }
            }

            setSelectedDay(null);
          }
        }}
      >
        <DialogContent className="bottom-0 left-0 right-0 top-auto max-h-[85vh] w-full max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-t-lg border-t sm:hidden data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom">
          {renderMobileDayDetail()}
        </DialogContent>
      </Dialog>

      {renderActiveTimer()}
    </div>
  );
}

// Mobile Day Detail Modal Component
interface DayDetailModalProps {
  day: Date;
  session: Doc<"readingSessions"> | undefined;
  plannedPages: number;
  plannedChapter: number;
  isRead: boolean;
  isMissed: boolean;
  canEdit: boolean;
  isActionPending: boolean;
  onReadToggle: () => Promise<void>;
  onMissedToggle: () => Promise<void>;
  chapterMode: boolean;
  chapterOnlyMode: boolean;
  useChapterDropdown: boolean;
  chapterMax?: number;
  chapterValue: string;
  onChapterChange: (value: string) => void;
  onChapterSelect: (value: string) => void;
  onChapterBlur: () => void;
  inputValue: string;
  maxStopPage?: number;
  pagesReadToday: number;
  onInputChange: (value: string) => void;
  onInputBlur: () => void;
  reflectionNote?: string;
  onReflectionNoteSave: (note: string) => Promise<void>;
  onTimerOpen?: () => void;
  savedTimerDurationSec?: number;
}

function DayDetailModal({
  day,
  plannedPages,
  plannedChapter,
  isRead,
  isMissed,
  canEdit,
  isActionPending,
  onReadToggle,
  onMissedToggle,
  chapterMode,
  chapterOnlyMode,
  useChapterDropdown,
  chapterMax,
  chapterValue,
  onChapterChange,
  onChapterSelect,
  onChapterBlur,
  inputValue,
  maxStopPage,
  pagesReadToday,
  onInputChange,
  onInputBlur,
  reflectionNote,
  onReflectionNoteSave,
  onTimerOpen,
  savedTimerDurationSec,
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
                onClick={() => {
                  void onReadToggle();
                }}
                disabled={!canEdit || isActionPending}
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
                onClick={() => {
                  void onMissedToggle();
                }}
                disabled={!canEdit || isActionPending}
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
              {chapterOnlyMode ? "Target Chapter" : "Planned Pages"}
            </label>
            <div className="rounded-lg border border-input bg-muted px-4 py-2 text-lg font-semibold text-foreground">
              {chapterOnlyMode
                ? `Chapter ${plannedChapter}`
                : `${plannedPages} pages`}
            </div>
          </div>

          {isRead && (
            <div className="space-y-3">
              {chapterMode && !chapterOnlyMode ? (
                <>
                  <div className="flex gap-3">
                    <div className="min-w-0 flex-1">
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Chapter
                      </label>
                      {useChapterDropdown && chapterMax ? (
                        <select
                          value={chapterValue}
                          onChange={(e) => {
                            onChapterSelect(e.target.value);
                          }}
                          disabled={!canEdit}
                          className="w-full rounded-md border border-input bg-background px-4 py-3 text-lg font-semibold text-foreground"
                        >
                          {Array.from(
                            { length: chapterMax },
                            (_, index) => index + 1
                          ).map((chapter) => (
                            <option
                              key={chapter}
                              value={chapter}
                            >
                              Chapter {chapter}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={chapterValue}
                          onChange={(e) => onChapterChange(e.target.value)}
                          onBlur={onChapterBlur}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          disabled={!canEdit}
                          min="1"
                          className="w-full px-4 py-3 text-lg font-semibold"
                          placeholder="Chapter number"
                        />
                      )}
                    </div>
                    <div className="w-28 shrink-0">
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Stop Page
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
                        max={maxStopPage}
                        className="w-full px-4 py-3 text-lg font-semibold"
                        placeholder="Stop"
                      />
                    </div>
                  </div>
                  <p className="text-sm font-medium text-muted-foreground">
                    Pages read today: {pagesReadToday}
                  </p>
                </>
              ) : (
                <>
                  {chapterMode && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Chapter
                      </label>
                      {useChapterDropdown && chapterMax ? (
                        <select
                          value={chapterValue}
                          onChange={(e) => {
                            onChapterSelect(e.target.value);
                          }}
                          disabled={!canEdit}
                          className="w-full rounded-md border border-input bg-background px-4 py-3 text-lg font-semibold text-foreground"
                        >
                          {Array.from(
                            { length: chapterMax },
                            (_, index) => index + 1
                          ).map((chapter) => (
                            <option
                              key={chapter}
                              value={chapter}
                            >
                              Chapter {chapter}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <Input
                          type="number"
                          inputMode="numeric"
                          value={chapterValue}
                          onChange={(e) => onChapterChange(e.target.value)}
                          onBlur={onChapterBlur}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.currentTarget.blur();
                            }
                          }}
                          disabled={!canEdit}
                          min="1"
                          className="w-full px-4 py-3 text-lg font-semibold"
                          placeholder="Chapter number"
                        />
                      )}
                    </div>
                  )}
                  {!chapterOnlyMode && (
                    <div>
                      <label className="mb-1 block text-sm font-medium text-foreground">
                        Stopped at Page
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
                        max={maxStopPage}
                        className="w-full px-4 py-3 text-lg font-semibold"
                        placeholder="Enter page"
                      />
                      <p className="mt-2 text-sm font-medium text-muted-foreground">
                        Pages read today: {pagesReadToday}
                      </p>
                    </div>
                  )}
                </>
              )}
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Reflection Note
                </label>
                <ReflectionNoteEditor
                  dayLabel={format(day, "MMMM d, yyyy")}
                  note={reflectionNote}
                  canEdit={canEdit}
                  onSave={onReflectionNoteSave}
                />
                {reflectionNote?.trim() && (
                  <p className="mt-2 whitespace-pre-wrap rounded-md border border-input bg-muted p-3 text-sm text-foreground">
                    {reflectionNote}
                  </p>
                )}
              </div>
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

        {/* Timer Section */}
        {canEdit && !isRead && !isMissed && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-foreground">
              Reading Timer
            </h3>
            <button
              onClick={onTimerOpen}
              className="flex w-full items-center gap-2 rounded-lg border border-input px-4 py-3 text-sm font-medium text-foreground hover:bg-accent"
            >
              <Timer className="h-5 w-5" />
              {savedTimerDurationSec
                ? `Timer: ${formatTimerDuration(savedTimerDurationSec)}`
                : "Set Timer"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
