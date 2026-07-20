import {
  format,
  isBefore,
  isAfter,
  isToday as isTodayDate,
} from "date-fns";
import {
  parseDateFromStorage,
  formatDateForStorage,
  getAllDaysInRange,
} from "@/lib/dateUtils";
import {
  distributePagesAcrossDays,
  distributeChaptersAcrossDays,
} from "@/lib/readingCalculator";
import {
  clampChapterNumber,
  getHighestChapterRead,
  isChapterOnlyBook,
} from "@/lib/chapterTracking";
import {
  behaviorCountsAsMissed,
  type DayBehavior,
} from "@/lib/scheduleDayType";

/** Minimal book fields needed for progress summary (matches Convex book shape). */
export interface ReadingProgressBookInput {
  totalPages?: number;
  totalChapters?: number;
  startDate: string;
  endDate: string;
  markedCompleteAt?: number;
  progressStyle?: "pages" | "chapters";
  ignorePages?: boolean;
}

/** Minimal session fields (matches reading session documents from queries). */
export interface ReadingProgressSessionInput {
  date: string;
  plannedPages: number;
  actualPages?: number;
  isRead: boolean;
  isMissed?: boolean;
  chapterNumber?: number | null;
}

export interface ExpectedPerUnaccountedDayRow {
  key: string;
  label: string;
  expectedPage?: number;
  expectedChapter?: number;
}

export interface ReadingProgressSummary {
  isChapterOnly: boolean;
  totalPagesRead?: number;
  expectedPageByToday?: number;
  progressPercentage: number;
  isAhead: boolean;
  isBehind: boolean;
  difference: number;
  differenceUnit: "page" | "chapter";
  totalPages?: number;
  totalChapters?: number;
  showStatusBanner: boolean;
  showExpectedDropdown: boolean;
  expectedPerUnaccountedDay: ExpectedPerUnaccountedDayRow[];
  currentChapter?: number;
  expectedChapterByToday?: number;
}

/**
 * Community schedule inputs. Supplied only for community books; without them
 * the summary keeps its original even-split behavior.
 */
export interface ReadingProgressSchedule {
  behaviorByDate: Map<string, DayBehavior>;
  chapterTargetByDate: Map<string, number>;
}

/** Highest cumulative target the schedule assigned on or before `through`. */
function highestTargetThrough(
  targets: Map<string, number>,
  allDays: Date[],
  through: Date
): number {
  let highest = 0;
  for (const day of allDays) {
    if (isAfter(day, through)) break;
    const target = targets.get(formatDateForStorage(day));
    if (target != null && target > highest) highest = target;
  }
  return Math.max(1, highest);
}

export function computeReadingProgressSummary(
  book: ReadingProgressBookInput,
  sessions: ReadingProgressSessionInput[],
  schedule?: ReadingProgressSchedule
): ReadingProgressSummary {
  const chapterOnly = isChapterOnlyBook(book);
  /** Days the schedule says nothing is expected on. */
  const isOffDay = (dayKey: string) => {
    const behavior = schedule?.behaviorByDate.get(dayKey);
    return behavior !== undefined && !behaviorCountsAsMissed(behavior);
  };
  const totalPages = book.totalPages ?? 0;
  const totalChapters = book.totalChapters;
  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const showStatusBanner = !isBefore(today, startDate);
  const sessionsByDate = new Map(sessions.map((session) => [session.date, session]));
  const allDays = getAllDaysInRange(startDate, endDate);

  if (chapterOnly && typeof totalChapters === "number" && totalChapters > 0) {
    // Community books follow the admin's per-day targets; personal books fall
    // back to an even split across the calendar.
    const useScheduledTargets = (schedule?.chapterTargetByDate.size ?? 0) > 0;
    const chapterDistribution = useScheduledTargets
      ? schedule!.chapterTargetByDate
      : distributeChaptersAcrossDays(totalChapters, startDate, endDate);

    if (book.markedCompleteAt != null) {
      return {
        isChapterOnly: true,
        progressPercentage: 100,
        isAhead: false,
        isBehind: false,
        difference: 0,
        differenceUnit: "chapter",
        totalChapters,
        showStatusBanner: false,
        showExpectedDropdown: false,
        expectedPerUnaccountedDay: [],
        currentChapter: totalChapters,
        expectedChapterByToday: totalChapters,
      };
    }

    const currentChapter = getHighestChapterRead(sessions, totalChapters);
    const completedDates = new Set(
      sessions.filter((session) => session.isRead).map((session) => session.date)
    );
    const daysFromStartToToday = allDays.filter(
      (day) => isBefore(day, today) || isTodayDate(day)
    );
    const unaccountedDays = daysFromStartToToday.filter((day) => {
      const dayKey = formatDateForStorage(day);
      if (completedDates.has(dayKey)) return false;
      if (sessionsByDate.get(dayKey)?.isMissed) return false;
      // Rest days aren't days the reader failed to account for.
      if (isOffDay(dayKey)) return false;
      return true;
    });
    const expectedPerUnaccountedDay = unaccountedDays.map((day, index) => {
      const dayKey = formatDateForStorage(day);
      return {
        key: `${dayKey}-${index}`,
        label: format(day, "MMM d"),
        expectedChapter: chapterDistribution.get(dayKey) ?? 1,
      };
    });
    const expectedChapterByToday = isBefore(today, startDate)
      ? undefined
      : useScheduledTargets
        ? // Targets are cumulative and only land on reading days, so the
          // expectation today is the highest one assigned so far.
          highestTargetThrough(
            chapterDistribution,
            allDays,
            isAfter(today, endDate) ? endDate : today
          )
        : chapterDistribution.get(
            formatDateForStorage(isAfter(today, endDate) ? endDate : today)
          ) ?? 1;
    const isBehind =
      expectedChapterByToday !== undefined && currentChapter < expectedChapterByToday;
    const isAhead =
      expectedChapterByToday !== undefined && currentChapter > expectedChapterByToday;
    const difference =
      expectedChapterByToday === undefined
        ? 0
        : isBehind
          ? expectedChapterByToday - currentChapter
          : isAhead
            ? currentChapter - expectedChapterByToday
            : 0;

    return {
      isChapterOnly: true,
      progressPercentage: (currentChapter / totalChapters) * 100,
      isAhead,
      isBehind,
      difference,
      differenceUnit: "chapter",
      totalChapters,
      showStatusBanner,
      showExpectedDropdown: unaccountedDays.some((day) => isBefore(day, today)),
      expectedPerUnaccountedDay,
      currentChapter,
      expectedChapterByToday,
    };
  }

  const capAtBookTotal = (value: number) => Math.min(value, totalPages);
  const chapterMode = book.progressStyle === "chapters";
  const totalPagesRead = sessions.reduce((sum, session) => {
    if (session.isRead) {
      return sum + (session.actualPages || session.plannedPages || 0);
    }
    return sum;
  }, 0);

  if (book.markedCompleteAt != null) {
    return {
      isChapterOnly: false,
      totalPagesRead: totalPages,
      expectedPageByToday: totalPages,
      progressPercentage: 100,
      isAhead: false,
      isBehind: false,
      difference: 0,
      differenceUnit: "page",
      totalPages,
      totalChapters,
      showStatusBanner: false,
      showExpectedDropdown: false,
      expectedPerUnaccountedDay: [],
      currentChapter:
        chapterMode && typeof totalChapters === "number" ? totalChapters : undefined,
      expectedChapterByToday:
        chapterMode && typeof totalChapters === "number" ? totalChapters : undefined,
    };
  }

  const pageDistribution = distributePagesAcrossDays(totalPages, startDate, endDate);
  const plannedPagesForDay = (dayKey: string) =>
    sessionsByDate.get(dayKey)?.plannedPages ?? pageDistribution.get(dayKey) ?? 0;

  const chapterSuggestions = new Map<string, number>();
  let scheduledExpectedPageByToday = 0;
  const daysFromStartToToday: Date[] = [];
  let lastKnownChapter = 1;
  let currentChapter: number | undefined;

  for (const day of allDays) {
    const dayKey = formatDateForStorage(day);
    const sessionForDay = sessionsByDate.get(dayKey);
    const sessionChapter = sessionForDay?.chapterNumber;

    if (
      chapterMode &&
      sessionChapter !== undefined &&
      sessionChapter !== null &&
      sessionChapter >= 1
    ) {
      lastKnownChapter = clampChapterNumber(sessionChapter, totalChapters);
    }

    if (chapterMode) {
      const suggestedChapter = clampChapterNumber(lastKnownChapter, totalChapters);
      chapterSuggestions.set(dayKey, suggestedChapter);
      if (sessionForDay?.isRead) {
        currentChapter = suggestedChapter;
      }
    }

    const dayPages = plannedPagesForDay(dayKey);
    if (isBefore(day, today) || isTodayDate(day)) {
      scheduledExpectedPageByToday += dayPages;
      daysFromStartToToday.push(day);
    } else {
      break;
    }
  }

  let todayPlannedPages = 0;
  let todayActualPages = 0;
  if (!isBefore(today, startDate) && !isAfter(today, endDate)) {
    const todayKey = formatDateForStorage(today);
    todayPlannedPages = plannedPagesForDay(todayKey);
    const todaySession = sessionsByDate.get(todayKey);
    if (todaySession?.isRead) {
      todayActualPages =
        todaySession.actualPages ?? todaySession.plannedPages ?? 0;
    }
  }

  const completedDates = new Set(
    sessions.filter((session) => session.isRead).map((session) => session.date)
  );
  const unaccountedDays = daysFromStartToToday.filter((day) => {
    const dayKey = formatDateForStorage(day);
    if (completedDates.has(dayKey)) return false;
    if (sessionsByDate.get(dayKey)?.isMissed) return false;
    // Rest days aren't days the reader failed to account for.
    if (isOffDay(dayKey)) return false;
    return true;
  });
  const expectedPerUnaccountedDay = unaccountedDays.map((day, index) => {
    const dayKey = formatDateForStorage(day);
    return {
      key: `${dayKey}-${index}`,
      label: format(day, "MMM d"),
      expectedPage: capAtBookTotal(
        totalPagesRead +
          unaccountedDays
            .slice(0, index + 1)
            .reduce(
              (sum, currentDay) =>
                sum + plannedPagesForDay(formatDateForStorage(currentDay)),
              0
            )
      ),
      expectedChapter: chapterMode
        ? chapterSuggestions.get(dayKey) ?? 1
        : undefined,
    };
  });

  const progressPercentage = totalPages > 0 ? (totalPagesRead / totalPages) * 100 : 0;
  const aheadOfSchedule = totalPagesRead > scheduledExpectedPageByToday;
  const remainingTodayPlanned = Math.max(0, todayPlannedPages - todayActualPages);
  let expectedPageByToday = aheadOfSchedule
    ? totalPagesRead + remainingTodayPlanned
    : scheduledExpectedPageByToday;
  expectedPageByToday = capAtBookTotal(expectedPageByToday);

  const isBehind = totalPagesRead < expectedPageByToday;
  const isAhead = totalPagesRead > scheduledExpectedPageByToday;
  const difference = isBehind
    ? expectedPageByToday - totalPagesRead
    : isAhead
      ? totalPagesRead - scheduledExpectedPageByToday
      : 0;
  const expectedChapterByToday =
    chapterMode && !isBefore(today, startDate)
      ? chapterSuggestions.get(
          formatDateForStorage(isAfter(today, endDate) ? endDate : today)
        ) ?? 1
      : undefined;

  return {
    isChapterOnly: false,
    totalPagesRead,
    expectedPageByToday,
    progressPercentage,
    isAhead,
    isBehind,
    difference,
    differenceUnit: "page",
    totalPages,
    totalChapters,
    showStatusBanner,
    showExpectedDropdown: unaccountedDays.some((day) => isBefore(day, today)),
    expectedPerUnaccountedDay,
    currentChapter,
    expectedChapterByToday,
  };
}
