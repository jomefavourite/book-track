"use client";

import { useMemo, useState, useEffect } from "react";
import { format, addDays } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id, Doc } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import { formatDateForStorage, parseDateFromStorage, formatTimerDuration, formatCountdown } from "@/lib/dateUtils";
import {
  calculateDailyPages,
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
import CatchUpSuggestion from "./CatchUpSuggestion";
import { Input } from "./ui/input";
import { ChevronDown, Timer } from "lucide-react";
import { filterStaleSessions } from "@/lib/resetGeneration";
import ReadingTimer, { type TimerPhase } from "./ReadingTimer";
import ReflectionNoteEditor from "./ReflectionNoteEditor";
import { playTimerEndSound } from "@/lib/timerSound";
import { DAY_TYPE_META, type ScheduleDayType } from "@/lib/scheduleDayType";

interface DaysViewProps {
  bookId: Id<"books">;
  book: Pick<
    Doc<"books">,
    | "startDate"
    | "endDate"
    | "totalPages"
    | "totalChapters"
    | "daysToRead"
    | "progressStyle"
    | "ignorePages"
    | "markedCompleteAt"
    | "resetGeneration"
    | "communityBookId"
  > &
    Record<string, unknown>;
  canEdit?: boolean;
}

export default function DaysView({
  bookId,
  book,
  canEdit = true,
}: DaysViewProps) {
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
  const communityBookId = book.communityBookId;
  const { data: scheduleQuery } = useQuery({
    ...convexQuery(api.communitySchedule.getScheduleForBook, {
      communityBookId: communityBookId as Id<"communityBooks">,
    }),
    enabled: Boolean(communityBookId),
  });
  const dayTypeByDate = useMemo(() => {
    const map = new Map<string, ScheduleDayType>();
    (scheduleQuery ?? []).forEach((entry) => {
      map.set(entry.date, entry.dayType as ScheduleDayType);
    });
    return map;
  }, [scheduleQuery]);
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
  const allSessions = useMemo(() => sessionsQuery ?? [], [sessionsQuery]);
  const currentGeneration = book.resetGeneration ?? 0;
  // Only the current reading cycle drives progress; stale (pre-reset) sessions are excluded.
  const sessions = useMemo(
    () =>
      allSessions.filter(
        (session) => (session.resetGeneration ?? 0) === currentGeneration
      ),
    [allSessions, currentGeneration]
  );
  // Archived (stale) sessions from previous reading cycles, newest first.
  const staleSessions = useMemo(
    () =>
      filterStaleSessions(allSessions, book).sort((a, b) =>
        a.date < b.date ? 1 : a.date > b.date ? -1 : 0
      ),
    [allSessions, book]
  );
  const [previousAttemptsOpen, setPreviousAttemptsOpen] = useState(false);

  // Local state for input values to allow smooth typing
  const [inputValues, setInputValues] = useState<Map<string, string>>(
    new Map()
  );
  const [chapterInputValues, setChapterInputValues] = useState<
    Map<string, string>
  >(new Map());
  const [openTimerDateKey, setOpenTimerDateKey] = useState<string | null>(null);

  // Active timer — one at a time, persists across dialog open/close
  const [activeTimerDateKey, setActiveTimerDateKey] = useState<string | null>(null);
  const [timerPhase, setTimerPhase] = useState<TimerPhase>({ status: "setup" });
  const [timerDisplaySec, setTimerDisplaySec] = useState(0);

  // Countdown interval — only runs when timer is active
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
    setTimerPhase({ status: "running", endsAt: Date.now() + totalSec * 1000, totalSec });
  }

  function handleTimerPause() {
    if (timerPhase.status !== "running") return;
    const remainingSec = Math.ceil((timerPhase.endsAt - Date.now()) / 1000);
    setTimerDisplaySec(remainingSec);
    setTimerPhase({ status: "paused", remainingSec, totalSec: timerPhase.totalSec });
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

  // Sync input values with sessions when they change
  useEffect(() => {
    const newInputValues = new Map<string, string>();
    const newChapterValues = new Map<string, string>();
    sessions.forEach((session) => {
      if (session.isRead) {
        const value = stopPageByDate.get(session.date)?.toString() || "";
        newInputValues.set(session.date, value);
        if (chapterMode) {
          const ch =
            session.chapterNumber != null
              ? String(session.chapterNumber)
              : "1";
          newChapterValues.set(session.date, ch);
        }
      }
    });
    setInputValues(newInputValues);
    setChapterInputValues(newChapterValues);
  }, [sessions, chapterMode, stopPageByDate]);

  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);
  const totalDays =
    book.daysToRead ||
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  const pagesPerDay = useMemo(
    () =>
      !chapterOnlyMode && typeof book.totalPages === "number"
        ? calculateDailyPages(book.totalPages, totalDays)
        : 0,
    [book.totalPages, totalDays, chapterOnlyMode]
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

  const chapterDistribution = useMemo(() => {
    if (!chapterOnlyMode || !chapterDropdownMax) {
      return new Map<string, number>();
    }
    return distributeChaptersAcrossDays(chapterDropdownMax, startDate, endDate);
  }, [chapterOnlyMode, chapterDropdownMax, startDate, endDate]);

  const chapterSuggestions = useMemo(
    () =>
      computeChapterSuggestions(
        days.map(({ date }) => date),
        (dateKey) => sessionsMap.get(dateKey),
        chapterDropdownMax,
        chapterDistribution,
        chapterOnlyMode
      ),
    [days, sessionsMap, chapterDropdownMax, chapterDistribution, chapterOnlyMode]
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
      return normalizeChapterValue(
        getTargetChapterForDate(dateKey, chapterSuggestions, chapterDistribution)
      );
    }
    const n = Number(raw);
    if (isNaN(n) || n < 1) {
      return normalizeChapterValue(
        getTargetChapterForDate(dateKey, chapterSuggestions, chapterDistribution)
      );
    }
    return normalizeChapterValue(n);
  };

  const handleChapterUpdate = async (dateKey: string, chapterNumber: number) => {
    if (!chapterMode || !canEdit || !user?.id) return;
    const session = sessionsMap.get(dateKey);
    if (!session?.isRead) return;

    await updateSession({
      sessionId: session._id,
      userId: user.id,
      isRead: session.isRead,
      chapterNumber: normalizeChapterValue(chapterNumber),
    });
  };

  const handleDayToggle = async (dateKey: string) => {
    if (!canEdit || !user?.id) return;
    const existingSession = sessionsMap.get(dateKey);
    const defaultPlannedPages = chapterOnlyMode ? 0 : pagesPerDay;

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
        if (!chapterOnlyMode) {
          // Redistribute pages after unmarking as read (non-blocking)
          setTimeout(() => {
            redistributePagesAfterUnread(dateKey).catch(console.error);
          }, 0);
        }
      } else {
        // Not read - mark as read
        const markPages = chapterOnlyMode
          ? { actualPages: 0, stopPage: undefined }
          : getDefaultStopPageForDate({
              sessions,
              dateKey,
              plannedPages: existingSession.plannedPages ?? pagesPerDay,
              totalPages: book.totalPages,
            });
        updateSession({
          sessionId: existingSession._id,
          userId: user.id,
          isRead: true,
          isMissed: false,
          ...(chapterOnlyMode ? {} : markPages),
          ...(chapterMode
            ? { chapterNumber: defaultChapterForDate(dateKey) }
            : {}),
        }).catch(console.error);
        if (!chapterOnlyMode) {
          // Redistribute after marking as read (non-blocking)
          setTimeout(() => {
            redistributePages(dateKey, markPages.actualPages, new Set([dateKey])).catch(
              console.error
            );
          }, 0);
        }
      }
    } else {
      const markPages = chapterOnlyMode
        ? { actualPages: 0, stopPage: undefined }
        : getDefaultStopPageForDate({
            sessions,
            dateKey,
            plannedPages: defaultPlannedPages,
            totalPages: book.totalPages,
          });
      createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages: defaultPlannedPages,
        ...(chapterOnlyMode ? {} : markPages),
        isRead: true,
        isMissed: false,
        ...(chapterMode
          ? { chapterNumber: defaultChapterForDate(dateKey) }
          : {}),
      }).catch(console.error);

      if (!chapterOnlyMode) {
        // Redistribute after marking as read (non-blocking)
        setTimeout(() => {
          redistributePages(dateKey, markPages.actualPages, new Set([dateKey])).catch(
            console.error
          );
        }, 0);
      }
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
        if (!chapterOnlyMode) {
          // Redistribute pages after unmarking as missed
          let totalPagesRead = 0;
          days.forEach(({ dateKey: dKey }) => {
            const sess = sessionsMap.get(dKey);
            if (sess?.isRead && !sess?.isMissed && dKey !== dateKey) {
              totalPagesRead += sess.actualPages || sess.plannedPages || 0;
            }
          });
          const remainingPages = Math.max(
            0,
            (book.totalPages ?? 0) - totalPagesRead
          );
          const unreadDays = days.filter(({ dateKey: dKey }) => {
            const sess = sessionsMap.get(dKey);
            return (!sess?.isRead && !sess?.isMissed) || dKey === dateKey;
          });

          if (unreadDays.length > 0) {
            const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
            const remainder = remainingPages % unreadDays.length;

          const updatePromises: Array<Promise<unknown>> = [];
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
        plannedPages: chapterOnlyMode ? 0 : pagesPerDay,
        isRead: false,
        isMissed: true,
      });

      // No redistribution needed when marking as missed - missed days are excluded from redistribution
      return; // Exit early - no redistribution needed for missed days
    }
  };

  const redistributePagesAfterUnread = async (dateKey: string) => {
    if (chapterOnlyMode) return;
    if (!user?.id) return;
    let totalPagesRead = 0;
    days.forEach(({ dateKey: dKey }) => {
      const sess = sessionsMap.get(dKey);
      if (sess?.isRead && !sess?.isMissed && dKey !== dateKey) {
        totalPagesRead += sess.actualPages || sess.plannedPages || 0;
      }
    });
    const remainingPages = Math.max(0, (book.totalPages ?? 0) - totalPagesRead);
    const unreadDays = days.filter(({ dateKey: dKey }) => {
      const sess = sessionsMap.get(dKey);
      return (!sess?.isRead && !sess?.isMissed) || dKey === dateKey;
    });

    if (unreadDays.length > 0) {
      const pagesPerDay = Math.floor(remainingPages / unreadDays.length);
      const remainder = remainingPages % unreadDays.length;

      const updatePromises: Array<Promise<unknown>> = [];
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
    if (chapterOnlyMode) return;
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
    const remainingPages = Math.max(0, (book.totalPages ?? 0) - totalPagesRead);
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
    const updatePromises: Array<Promise<unknown>> = [];

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

    days
      .filter(({ dateKey }) => dateKey > updatedDateKey)
      .forEach(({ dateKey }) => {
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

  const handlePagesUpdate = async (dateKey: string, stopPageInput: number) => {
    if (chapterOnlyMode) return;
    if (!canEdit || !user?.id) return;
    const existingSession = sessionsMap.get(dateKey);

    if (existingSession && existingSession.isRead) {
      const priorStopPage = getPreviousStopPage(sessions, dateKey, book.totalPages);
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

  const handleInputBlur = async (dateKey: string) => {
    const inputValue = inputValues.get(dateKey);

    if (inputValue === undefined || inputValue === "") return;

    const stopPage = Number(inputValue);
    if (isNaN(stopPage) || stopPage < 0) {
      // Reset to original value if invalid
      const session = sessionsMap.get(dateKey);
      if (session) {
        setInputValues((prev) => {
          const newMap = new Map(prev);
          newMap.set(
            dateKey,
            (stopPageByDate.get(dateKey) || 0).toString()
          );
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

    await handlePagesUpdate(dateKey, stopPage);
  };

  const handleChapterInputBlur = async (dateKey: string) => {
    if (!chapterMode || !canEdit || !user?.id) return;
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

    await handleChapterUpdate(dateKey, ch);
  };

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
  }, [sessions, book.totalPages, book.totalChapters, book.markedCompleteAt, chapterOnlyMode, chapterDropdownMax]);

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
        previousStopPage: getPreviousStopPage(sessions, dateKey, book.totalPages),
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {days.map(({ dayNumber, date, dateKey }) => {
            const session = sessionsMap.get(dateKey);
            const isRead = session?.isRead || false;
            const isMissed = session?.isMissed || false;
            const scheduledDayType = dayTypeByDate.get(dateKey) ?? "reading";
            const isNonReadingDay =
              scheduledDayType !== "reading" && !isRead && !isMissed;
            const dayTypeMeta = DAY_TYPE_META[scheduledDayType];
            const DayTypeIcon = dayTypeMeta.icon;
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
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium">Day {dayNumber}</span>
                      {/* Timer — only for unread, non-missed days */}
                      {canEdit && !isRead && !isMissed && !isNonReadingDay && (
                        <button
                          onClick={() => setOpenTimerDateKey(dateKey)}
                          className="flex items-center gap-0.5 rounded text-muted-foreground transition-colors hover:text-foreground"
                          aria-label="Reading timer"
                        >
                          {activeTimerDateKey === dateKey && timerPhase.status !== "setup" ? (
                            <span className="inline-flex items-center gap-0.5 font-mono text-[10px]">
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
                    {/* Read Checkbox - only show if not missed and not a non-reading scheduled day */}
                    {!isMissed && !isNonReadingDay && (
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
                    {/* Missed Checkbox - only show if not read and not a non-reading scheduled day */}
                    {!isRead && !isNonReadingDay && (
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
                {isNonReadingDay ? (
                  <div className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
                    <DayTypeIcon className="h-3.5 w-3.5 shrink-0" />
                    {dayTypeMeta.label}
                  </div>
                ) : (
                  !isMissed && (
                    <div className="mb-2 text-xs">
                      {chapterOnlyMode
                        ? `Target: Chapter ${targetChapter}`
                        : `Plan: ${session?.plannedPages ?? pagesPerDay} pages`}
                    </div>
                  )
                )}
                {isRead && chapterOnlyMode && (
                  <div className="mb-2 text-xs">
                    {`Read: Chapter ${readChapter}`}
                  </div>
                )}
                {isRead && !chapterOnlyMode && (
                  <div className="mb-2 text-xs">
                    {`Read: ${getPagesReadForDate(
                      dateKey,
                      session?.plannedPages ?? pagesPerDay,
                      session
                    )} pages`}
                  </div>
                )}
                {session?.timerDurationSec && !isMissed && (
                  <div className="mb-1 flex items-center gap-0.5 text-xs text-muted-foreground">
                    <Timer className="h-3 w-3" />
                    {formatTimerDuration(session.timerDurationSec)}
                  </div>
                )}
                {isRead && (
                  <div className="space-y-2">
                    {chapterMode && !chapterOnlyMode ? (
                      <>
                      <div className="flex gap-2">
                        <div className="min-w-0 flex-1">
                          <label className="block text-xs font-medium text-white">
                            Chapter
                          </label>
                          {useChapterDropdown ? (
                            <select
                              value={String(defaultChapterForDate(dateKey))}
                              onChange={(e) => {
                                handleChapterInputChange(dateKey, e.target.value);
                                void handleChapterUpdate(
                                  dateKey,
                                  Number(e.target.value)
                                );
                              }}
                              disabled={!canEdit}
                              className={`mt-1 h-6 sm:h-7 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground dark:text-foreground ${
                                canEdit
                                  ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                                  : "cursor-not-allowed opacity-50"
                              }`}
                            >
                              {Array.from(
                                { length: chapterDropdownMax },
                                (_, index) => index + 1
                              ).map((chapter) => (
                                <option key={chapter} value={chapter}>
                                  Chapter {chapter}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <Input
                              type="number"
                              inputMode="numeric"
                              value={String(defaultChapterForDate(dateKey))}
                              onChange={(e) =>
                                handleChapterInputChange(dateKey, e.target.value)
                              }
                              onBlur={() => handleChapterInputBlur(dateKey)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.currentTarget.blur();
                                }
                              }}
                              disabled={!canEdit}
                              min="1"
                              className={`mt-1 h-6 sm:h-7 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground dark:text-foreground ${
                                canEdit
                                  ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                                  : "cursor-not-allowed opacity-50"
                              }`}
                            />
                          )}
                        </div>
                        <div className="w-20 shrink-0 sm:w-24">
                          <label className="block text-xs font-medium text-white">
                            Stop Page
                          </label>
                          <Input
                            type="number"
                            id="actualPages"
                            value={
                              inputValues.get(dateKey) ??
                              getStopPageInputValue(
                                dateKey,
                                session?.plannedPages ?? pagesPerDay
                              )
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
                            max={book.totalPages}
                            className={`mt-1 h-6 sm:h-7 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground dark:text-foreground ${
                              canEdit
                                ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                                : "cursor-not-allowed opacity-50"
                            }`}
                          />
                        </div>
                      </div>
                      {canEdit && (
                        <ReflectionNoteEditor
                          dayLabel={`Day ${dayNumber} - ${format(date, "MMM d, yyyy")}`}
                          note={session?.reflectionNote}
                          canEdit={canEdit}
                          onSave={(note) =>
                            handleReflectionNoteSave(dateKey, note)
                          }
                        />
                      )}
                      </>
                    ) : (
                      <>
                        {chapterMode && (
                          <div>
                            <label className="block text-xs font-medium text-white">
                              Chapter
                            </label>
                            {useChapterDropdown ? (
                              <select
                                value={String(defaultChapterForDate(dateKey))}
                                onChange={(e) => {
                                  handleChapterInputChange(dateKey, e.target.value);
                                  void handleChapterUpdate(
                                    dateKey,
                                    Number(e.target.value)
                                  );
                                }}
                                disabled={!canEdit}
                                className={`mt-1 h-6 sm:h-7 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground dark:text-foreground ${
                                  canEdit
                                    ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                                    : "cursor-not-allowed opacity-50"
                                }`}
                              >
                                {Array.from(
                                  { length: chapterDropdownMax },
                                  (_, index) => index + 1
                                ).map((chapter) => (
                                  <option key={chapter} value={chapter}>
                                    Chapter {chapter}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <Input
                                type="number"
                                inputMode="numeric"
                                value={String(defaultChapterForDate(dateKey))}
                                onChange={(e) =>
                                  handleChapterInputChange(dateKey, e.target.value)
                                }
                                onBlur={() => handleChapterInputBlur(dateKey)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.currentTarget.blur();
                                  }
                                }}
                                disabled={!canEdit}
                                min="1"
                                className={`mt-1 h-6 sm:h-7 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground dark:text-foreground ${
                                  canEdit
                                    ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                                    : "cursor-not-allowed opacity-50"
                                }`}
                              />
                            )}
                          </div>
                        )}
                        <div className="flex items-end gap-2">
                          {!chapterOnlyMode && (
                            <div className="flex-1 min-w-0">
                              <label className="block text-xs font-medium text-white">
                                Stopped at Page
                              </label>
                              <Input
                                type="number"
                                id="actualPages"
                                value={
                                  inputValues.get(dateKey) ??
                                  getStopPageInputValue(
                                    dateKey,
                                    session?.plannedPages ?? pagesPerDay
                                  )
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
                                max={book.totalPages}
                                className={`mt-1 h-6 sm:h-7 w-full rounded border border-input bg-background px-1.5 py-1 text-xs text-foreground dark:text-foreground ${
                                  canEdit
                                    ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                                    : "cursor-not-allowed opacity-50"
                                }`}
                              />
                            </div>
                          )}
                          {canEdit && (
                            <div className={chapterOnlyMode ? "w-full" : "flex-1 min-w-0"}>
                              <ReflectionNoteEditor
                                dayLabel={`Day ${dayNumber} - ${format(date, "MMM d, yyyy")}`}
                                note={session?.reflectionNote}
                                canEdit={canEdit}
                                onSave={(note) =>
                                  handleReflectionNoteSave(dateKey, note)
                                }
                              />
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
                {isMissed && (
                  <div className="text-xs font-medium text-red-800 dark:text-red-200">
                    Missed
                  </div>
                )}
                <ReadingTimer
                  open={openTimerDateKey === dateKey}
                  onOpenChange={(open) =>
                    setOpenTimerDateKey(open ? dateKey : null)
                  }
                  dayLabel={`Day ${dayNumber} – ${format(date, "MMM d")}`}
                  sessionId={session?._id}
                  userId={user?.id ?? ""}
                  savedDurationSec={session?.timerDurationSec}
                  onSaved={(durationSec) => {
                    queryClient.setQueryData<ReadingSessionDoc[]>(
                      sessionsQueryKey,
                      (old) =>
                        old?.map((s) =>
                          s._id === session?._id
                            ? { ...s, timerDurationSec: durationSec }
                            : s
                        )
                    );
                  }}
                  phase={activeTimerDateKey === dateKey ? timerPhase : { status: "setup" }}
                  displaySec={activeTimerDateKey === dateKey ? timerDisplaySec : 0}
                  onStart={(totalSec) => handleTimerStart(dateKey, totalSec)}
                  onPause={handleTimerPause}
                  onResume={handleTimerResume}
                  onReset={handleTimerReset}
                />
              </div>
            );
          })}
        </div>
      </div>

      {staleSessions.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-4">
          <button
            type="button"
            onClick={() => setPreviousAttemptsOpen((open) => !open)}
            className="flex w-full items-center justify-between gap-3 text-left"
            aria-expanded={previousAttemptsOpen}
          >
            <span className="text-sm font-medium text-foreground">
              Previous attempts ({staleSessions.length})
            </span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                previousAttemptsOpen ? "rotate-180" : ""
              }`}
            />
          </button>

          {previousAttemptsOpen && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-xs text-muted-foreground">
                Archived from before this book was reset. These records are
                read-only.
              </p>
              <div className="max-h-80 space-y-2 overflow-y-auto opacity-70">
                {staleSessions.map((session) => {
                  const read = session.isRead && !session.isMissed;
                  const missed = session.isMissed ?? false;
                  const note = session.reflectionNote?.trim();
                  return (
                    <div
                      key={session._id}
                      className={`rounded border px-3 py-2 text-sm ${
                        read
                          ? "border-green-600/60 bg-green-100/70 text-green-900 dark:border-green-800 dark:bg-green-950/60 dark:text-green-200"
                          : missed
                            ? "border-red-600/60 bg-red-100/70 text-red-900 dark:border-red-800 dark:bg-red-950/60 dark:text-red-200"
                            : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">
                          {format(
                            parseDateFromStorage(session.date),
                            "MMM d, yyyy"
                          )}
                        </span>
                        <span className="text-xs">
                          {read
                            ? chapterOnlyMode
                              ? session.chapterNumber != null
                                ? `Read · Ch ${session.chapterNumber}`
                                : "Read"
                              : `Read · ${
                                  session.actualPages ??
                                  session.plannedPages ??
                                  0
                                } pages`
                            : missed
                              ? "Missed"
                              : "Not logged"}
                        </span>
                      </div>
                      {note && (
                        <p className="mt-1 whitespace-pre-wrap text-xs opacity-90">
                          {note}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
