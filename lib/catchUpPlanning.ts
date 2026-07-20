import { isAfter, startOfToday } from "date-fns";
import {
  parseDateFromStorage,
  formatDateForStorage,
  getAllDaysInRange,
} from "./dateUtils";
import {
  calculateCatchUpPages,
  getMissedDays,
  distributePagesAcrossDays,
  distributeChaptersAcrossDays,
} from "./readingCalculator";
import {
  getHighestChapterRead,
  isChapterOnlyBook,
} from "./chapterTracking";
import {
  behaviorCountsAsMissed,
  behaviorGivesCatchUpCapacity,
  type DayBehavior,
} from "./scheduleDayType";

export interface CatchUpBookInput {
  startDate: string;
  endDate: string;
  totalPages?: number;
  totalChapters?: number;
  markedCompleteAt?: number;
  progressStyle?: "pages" | "chapters";
  ignorePages?: boolean;
}

export interface CatchUpSessionInput {
  date: string;
  isRead: boolean;
  isMissed?: boolean;
  actualPages?: number;
  plannedPages: number;
  chapterNumber?: number | null;
}

/**
 * The community schedule as the catch-up math needs it. Supplied only for
 * community books — personal books pass nothing and keep the original
 * every-calendar-day behavior exactly.
 */
export interface CatchUpSchedule {
  behaviorByDate: Map<string, DayBehavior>;
  /** Cumulative target chapter per scheduled reading day */
  chapterTargetByDate: Map<string, number>;
  /** Pages assigned per scheduled reading day */
  plannedPagesByDate: Map<string, number>;
}

export type CatchUpSuggestionResult =
  | { type: "overdue"; message: string }
  | {
      type: "catchup";
      message: string;
      remainingChapters: number;
      remainingDays: number;
    }
  | {
      type: "catchup";
      message: string;
      remainingPages: number;
      remainingDays: number;
    }
  | null;

/**
 * Works out whether the reader is behind and what they'd need to do today.
 *
 * Without a schedule this reproduces the original behavior: every calendar day
 * in the range counts as a day they were meant to read, and the expected
 * position comes from an even split across the whole range.
 *
 * With a schedule, the community's own day labels drive it — days whose label
 * is "off" are neither missed nor available, flexible days are available but
 * never missed, and the expected position comes from the admin's per-day
 * targets rather than a recomputed even split.
 */
export function computeCatchUpSuggestion(
  book: CatchUpBookInput,
  sessions: CatchUpSessionInput[],
  schedule?: CatchUpSchedule
): CatchUpSuggestionResult {
  if (book.markedCompleteAt != null) {
    return null;
  }

  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);
  const today = startOfToday();

  if (isAfter(today, endDate)) {
    return null;
  }

  const explicitlyMissedDates = new Set(
    sessions.filter((session) => session.isMissed).map((session) => session.date)
  );
  const completedDates = new Set(
    sessions
      .filter((session) => session.isRead && !session.isMissed)
      .map((session) => session.date)
  );

  // A day only counts as missed if its label expects reading. Off and flexible
  // days join the explicitly-missed set so `getMissedDays` skips them.
  const excludedFromMissed = new Set(explicitlyMissedDates);
  if (schedule) {
    for (const day of getAllDaysInRange(startDate, endDate)) {
      const dayKey = formatDateForStorage(day);
      const behavior = schedule.behaviorByDate.get(dayKey);
      if (behavior && !behaviorCountsAsMissed(behavior)) {
        excludedFromMissed.add(dayKey);
      }
    }
  }

  const missedDays = getMissedDays(
    startDate,
    endDate,
    completedDates,
    excludedFromMissed
  );

  if (missedDays.length === 0) {
    return null;
  }

  // Days still available to catch up on: reading and flexible days, minus any
  // the reader has already written off.
  const allRemainingDays = getAllDaysInRange(today, endDate);
  const remainingDays = allRemainingDays.filter((day) => {
    const dayKey = formatDateForStorage(day);
    if (explicitlyMissedDates.has(dayKey)) return false;
    if (!schedule) return true;
    const behavior = schedule.behaviorByDate.get(dayKey);
    return behavior === undefined || behaviorGivesCatchUpCapacity(behavior);
  }).length;

  if (isChapterOnlyBook(book) && typeof book.totalChapters === "number") {
    const currentChapter = getHighestChapterRead(sessions, book.totalChapters);
    const todayKey = formatDateForStorage(today);

    // Prefer the admin's own targets; fall back to an even split for personal
    // books and for schedules that carry no chapter assignments.
    const scheduledTargets = schedule?.chapterTargetByDate;
    const useScheduledTargets = (scheduledTargets?.size ?? 0) > 0;
    const chapterDistribution = useScheduledTargets
      ? scheduledTargets!
      : distributeChaptersAcrossDays(book.totalChapters, startDate, endDate);

    const expectedChapterByToday = useScheduledTargets
      ? highestTargetThrough(scheduledTargets!, startDate, today)
      : chapterDistribution.get(todayKey) ?? 1;

    if (currentChapter >= expectedChapterByToday) {
      return null;
    }

    const remainingChapters = Math.max(0, book.totalChapters - currentChapter);
    if (remainingDays <= 0) {
      return {
        type: "overdue" as const,
        message: `You have ${remainingChapters} chapter${
          remainingChapters === 1 ? "" : "s"
        } remaining and the reading period has ended.`,
      };
    }

    const paced = currentChapter + Math.ceil(remainingChapters / remainingDays);
    // With a schedule, never suggest less than where the plan already expects
    // them to be. Without one there is no plan to floor against, so the
    // original even-pace figure stands unchanged.
    const suggestedChapter = Math.min(
      book.totalChapters,
      useScheduledTargets ? Math.max(paced, expectedChapterByToday) : paced
    );

    return {
      type: "catchup" as const,
      message: `You've missed ${missedDays.length} day(s). To catch up, reach Chapter ${suggestedChapter} today.`,
      remainingChapters,
      remainingDays,
    };
  }

  const totalPages = book.totalPages ?? 0;
  const totalPagesRead = sessions.reduce((sum, session) => {
    if (session.isRead) {
      return sum + (session.actualPages || session.plannedPages || 0);
    }
    return sum;
  }, 0);

  const scheduledPages = schedule?.plannedPagesByDate;
  const useScheduledPages = (scheduledPages?.size ?? 0) > 0;
  const pageDistribution = useScheduledPages
    ? scheduledPages!
    : distributePagesAcrossDays(totalPages, startDate, endDate);

  let expectedPageByToday = 0;
  for (const day of getAllDaysInRange(startDate, endDate)) {
    const dayKey = formatDateForStorage(day);
    const dayPages = pageDistribution.get(dayKey) || 0;
    if (day <= today) {
      expectedPageByToday += dayPages;
    } else {
      break;
    }
  }

  if (totalPagesRead >= expectedPageByToday) {
    return null;
  }

  const totalPagesReadForCatchUp = sessions.reduce((sum, session) => {
    if (session.isRead && !session.isMissed) {
      return sum + (session.actualPages || session.plannedPages);
    }
    return sum;
  }, 0);

  const remainingPages = totalPages - totalPagesReadForCatchUp;

  if (remainingDays <= 0) {
    return {
      type: "overdue" as const,
      message: `You have ${remainingPages} pages remaining and the reading period has ended.`,
    };
  }

  const suggestedPages = calculateCatchUpPages(
    totalPages,
    totalPagesReadForCatchUp,
    remainingDays
  );

  return {
    type: "catchup" as const,
    message: `You've missed ${missedDays.length} day(s). To catch up, read ${suggestedPages} pages today.`,
    remainingPages,
    remainingDays,
  };
}

/**
 * Chapter targets are cumulative, so where a reader "should" be today is the
 * highest target the schedule assigned on or before today — not an even split
 * across the calendar, which ignores which days were reading days at all.
 */
function highestTargetThrough(
  targets: Map<string, number>,
  startDate: Date,
  today: Date
): number {
  let highest = 0;
  for (const day of getAllDaysInRange(startDate, today)) {
    const target = targets.get(formatDateForStorage(day));
    if (target != null && target > highest) {
      highest = target;
    }
  }
  return Math.max(1, highest);
}
