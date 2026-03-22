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
import { distributePagesAcrossDays } from "@/lib/readingCalculator";

/** Minimal book fields needed for progress summary (matches Convex book shape). */
export interface ReadingProgressBookInput {
  totalPages: number;
  startDate: string;
  endDate: string;
}

/** Minimal session fields (matches reading session documents from queries). */
export interface ReadingProgressSessionInput {
  date: string;
  plannedPages: number;
  actualPages?: number;
  isRead: boolean;
  isMissed?: boolean;
}

export interface ExpectedPerUnaccountedDayRow {
  key: string;
  label: string;
  expectedPage: number;
}

export interface ReadingProgressSummary {
  totalPagesRead: number;
  expectedPageByToday: number;
  progressPercentage: number;
  isAhead: boolean;
  isBehind: boolean;
  pagesDifference: number;
  totalPages: number;
  showStatusBanner: boolean;
  showExpectedDropdown: boolean;
  expectedPerUnaccountedDay: ExpectedPerUnaccountedDayRow[];
}

/**
 * Computes reading progress summary including:
 * - Schedule-based cumulative expected through today (`scheduledExpectedPageByToday` internally)
 * - When ahead of cumulative schedule: displayed "Expected by Today" = pages read + remaining planned for today
 *   (not full today plan, since totalPagesRead already includes today's actual pages)
 * - isBehind: totalPagesRead < displayed expectedPageByToday
 * - isAhead (green banner): ahead of cumulative schedule (read > scheduledExpectedPageByToday)
 * - pagesDifference: behind vs displayed expected, or pages ahead vs cumulative schedule (behind takes priority)
 * - Unaccounted-day dropdown rows (excludes read and missed days)
 * - Displayed expectations are capped at book.totalPages (stale vs redistributed per-day plans can otherwise sum above the book)
 */
export function computeReadingProgressSummary(
  book: ReadingProgressBookInput,
  sessions: ReadingProgressSessionInput[]
): ReadingProgressSummary {
  const capAtBookTotal = (n: number) => Math.min(n, book.totalPages);

  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const totalPagesRead = sessions.reduce((sum, session) => {
    if (session.isRead) {
      return sum + (session.actualPages || session.plannedPages || 0);
    }
    return sum;
  }, 0);

  const pageDistribution = distributePagesAcrossDays(
    book.totalPages,
    startDate,
    endDate
  );

  const sessionsByDate = new Map(sessions.map((s) => [s.date, s]));
  const plannedPagesForDay = (dayKey: string) =>
    sessionsByDate.get(dayKey)?.plannedPages ??
    pageDistribution.get(dayKey) ??
    0;

  const allDays = getAllDaysInRange(startDate, endDate);
  let scheduledExpectedPageByToday = 0;
  const daysFromStartToToday: Date[] = [];

  for (const day of allDays) {
    const dayKey = formatDateForStorage(day);
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
    sessions.filter((s) => s.isRead).map((s) => s.date)
  );
  const unaccountedDays = daysFromStartToToday.filter((day) => {
    const dayKey = formatDateForStorage(day);
    if (completedDates.has(dayKey)) return false;
    if (sessionsByDate.get(dayKey)?.isMissed) return false;
    return true;
  });
  const showExpectedDropdown = unaccountedDays.some((day) =>
    isBefore(day, today)
  );

  let cumulativePlanned = 0;
  const expectedPerUnaccountedDayRaw = unaccountedDays.map((day, index) => {
    const dayKey = formatDateForStorage(day);
    const dayPages = plannedPagesForDay(dayKey);
    cumulativePlanned += dayPages;
    return {
      key: `${dayKey}-${index}`,
      label: format(day, "MMM d"),
      expectedPage: totalPagesRead + cumulativePlanned,
    };
  });

  const progressPercentage = (totalPagesRead / book.totalPages) * 100;
  const aheadOfSchedule = totalPagesRead > scheduledExpectedPageByToday;
  const remainingTodayPlanned = Math.max(0, todayPlannedPages - todayActualPages);
  let expectedPageByToday = aheadOfSchedule
    ? totalPagesRead + remainingTodayPlanned
    : scheduledExpectedPageByToday;
  expectedPageByToday = capAtBookTotal(expectedPageByToday);

  // Displayed expected uses read + remaining today when ahead of schedule, so read > expected is impossible.
  // "Ahead" for the green banner is vs cumulative schedule only; amber still wins if behind end-of-day target.
  const isBehind = totalPagesRead < expectedPageByToday;
  const isAhead = totalPagesRead > scheduledExpectedPageByToday;

  let pagesDifference = 0;
  if (isBehind) {
    pagesDifference = expectedPageByToday - totalPagesRead;
  } else if (isAhead) {
    pagesDifference = totalPagesRead - scheduledExpectedPageByToday;
  }
  const showStatusBanner = !isBefore(today, startDate);

  const expectedPerUnaccountedDay = expectedPerUnaccountedDayRaw.map((row) => ({
    ...row,
    expectedPage: capAtBookTotal(row.expectedPage),
  }));

  return {
    totalPagesRead,
    expectedPageByToday,
    progressPercentage,
    isAhead,
    isBehind,
    pagesDifference,
    totalPages: book.totalPages,
    showStatusBanner,
    showExpectedDropdown,
    expectedPerUnaccountedDay,
  };
}
