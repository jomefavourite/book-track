import {
  calculateDaysInMonthRange,
  getAllDaysInRange,
  formatDateForStorage,
} from "./dateUtils";

export interface ReadingOption {
  days: number;
  pagesPerDay: number;
}

export function generateReadingOptions(totalPages: number): ReadingOption[] {
  const options: ReadingOption[] = [];
  const presetDays = [7, 14, 21, 30, 60, 90];

  for (const days of presetDays) {
    const pagesPerDay = Math.ceil(totalPages / days);
    options.push({ days, pagesPerDay });
  }

  return options;
}

export function calculateDailyPages(totalPages: number, days: number): number {
  return Math.ceil(totalPages / days);
}

/**
 * Distributes a total evenly across N reading days, front-loading the
 * remainder. Mirrors the even-split math in
 * `convex/communitySchedule.buildSessionsFromSchedule` so the schedule UI can
 * show the same defaults members receive. Returns `readingDayCount` values
 * summing to `total`.
 */
export function distributeAcrossReadingDays(
  total: number,
  readingDayCount: number
): number[] {
  if (readingDayCount <= 0) return [];
  const perDay = Math.floor(total / readingDayCount);
  const remainder = total % readingDayCount;
  return Array.from({ length: readingDayCount }, (_, index) =>
    perDay + (index < remainder ? 1 : 0)
  );
}

export type BalanceDay = { value: number; locked: boolean };

/**
 * Rebalances per-day PAGE targets so the reading days sum to `total`, keeping
 * locked (manually-edited) days fixed and spreading the remainder across the
 * unlocked days. If locked pages already meet or exceed `total`, unlocked days
 * fall to 0. Returns one value per input day, in order.
 */
export function balancePageTargets(
  days: BalanceDay[],
  total: number
): number[] {
  const out = days.map((day) => day.value);
  const flexibleIndexes = days
    .map((day, index) => ({ day, index }))
    .filter((entry) => !entry.day.locked)
    .map((entry) => entry.index);
  const lockedSum = days.reduce(
    (sum, day) => (day.locked ? sum + day.value : sum),
    0
  );
  const remaining = Math.max(0, total - lockedSum);
  const distribution = distributeAcrossReadingDays(
    remaining,
    flexibleIndexes.length
  );
  flexibleIndexes.forEach((index, position) => {
    out[index] = distribution[position] ?? 0;
  });
  return out;
}

/**
 * Rebalances per-day CHAPTER targets (cumulative "read up to chapter N") so the
 * last reading day reaches `total`, keeping locked days fixed. Unlocked days are
 * filled by linear interpolation between anchors — a virtual start (0), each
 * locked day, and a virtual end (`total`) on the last day when it is unlocked —
 * then clamped monotonic non-decreasing within [1, total]. Generalizes the
 * single-anchor "distribute remaining chapters forward" idea in
 * `lib/chapterPlanning.computeChapterSuggestions`. Returns one value per day.
 */
export function balanceChapterTargets(
  days: BalanceDay[],
  total: number
): number[] {
  const count = days.length;
  const out = days.map((day) => day.value);
  if (count === 0 || total <= 0) return out;

  const anchors: Array<{ index: number; value: number }> = [
    { index: -1, value: 0 },
  ];
  days.forEach((day, index) => {
    if (day.locked) anchors.push({ index, value: day.value });
  });
  if (!days[count - 1].locked) {
    anchors.push({ index: count - 1, value: total });
  }

  for (let a = 0; a < anchors.length - 1; a++) {
    const left = anchors[a];
    const right = anchors[a + 1];
    const span = right.index - left.index;
    for (let index = left.index + 1; index <= right.index; index++) {
      if (days[index].locked) continue;
      const t = (index - left.index) / span;
      out[index] = Math.round(left.value + t * (right.value - left.value));
    }
  }

  // Enforce monotonic non-decreasing targets within [1, total].
  let previous = 0;
  for (let index = 0; index < count; index++) {
    const raw = days[index].locked ? days[index].value : out[index];
    const clamped = Math.min(total, Math.max(1, Math.max(previous, raw)));
    out[index] = clamped;
    previous = clamped;
  }
  return out;
}

export function calculateDaysInMonthRangeForBook(
  startMonth: string,
  startYear: number,
  endMonth: string,
  endYear: number
): number {
  return calculateDaysInMonthRange(startMonth, startYear, endMonth, endYear);
}

export function distributePagesAcrossDays(
  totalPages: number,
  startDate: Date,
  endDate: Date
): Map<string, number> {
  const days = getAllDaysInRange(startDate, endDate);
  const totalDays = days.length;
  const pagesPerDay = Math.floor(totalPages / totalDays);
  const remainder = totalPages % totalDays;

  const distribution = new Map<string, number>();

  days.forEach((day, index) => {
    const dateKey = formatDateForStorage(day);
    // Distribute remainder pages across first days
    const pages = pagesPerDay + (index < remainder ? 1 : 0);
    distribution.set(dateKey, pages);
  });

  return distribution;
}

export function distributeChaptersAcrossDays(
  totalChapters: number,
  startDate: Date,
  endDate: Date
): Map<string, number> {
  const days = getAllDaysInRange(startDate, endDate);
  const distribution = new Map<string, number>();

  days.forEach((day, index) => {
    const dateKey = formatDateForStorage(day);
    const expectedChapter = Math.min(
      totalChapters,
      Math.max(1, Math.ceil(((index + 1) * totalChapters) / days.length))
    );
    distribution.set(dateKey, expectedChapter);
  });

  return distribution;
}

export function calculateCatchUpPages(
  totalPages: number,
  completedPages: number,
  remainingDays: number
): number {
  const remainingPages = totalPages - completedPages;
  if (remainingDays <= 0) {
    return remainingPages;
  }
  return Math.ceil(remainingPages / remainingDays);
}

export function distributePagesSequentially(
  books: Array<{ totalPages: number; days: number }>,
  availableDays: number
): Array<{
  bookIndex: number;
  startDay: number;
  endDay: number;
  pagesPerDay: number;
}> {
  const schedule: Array<{
    bookIndex: number;
    startDay: number;
    endDay: number;
    pagesPerDay: number;
  }> = [];

  let currentDay = 0;

  for (let i = 0; i < books.length; i++) {
    const book = books[i];
    const daysForBook = Math.min(book.days, availableDays - currentDay);

    if (daysForBook <= 0) {
      break;
    }

    const pagesPerDay = calculateDailyPages(book.totalPages, daysForBook);
    const endDay = currentDay + daysForBook - 1;

    schedule.push({
      bookIndex: i,
      startDay: currentDay,
      endDay,
      pagesPerDay,
    });

    currentDay = endDay + 1;
  }

  return schedule;
}

export function calculateRemainingPages(
  totalPages: number,
  actualPagesRead: number
): number {
  return Math.max(0, totalPages - actualPagesRead);
}

export function getMissedDays(
  startDate: Date,
  endDate: Date,
  completedDates: Set<string>,
  excludedDates?: Set<string>
): Date[] {
  const allDays = getAllDaysInRange(startDate, endDate);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return allDays.filter((day) => {
    const dayKey = formatDateForStorage(day);
    const isPast = day < today;
    const isMissed = !completedDates.has(dayKey);
    const isExcluded = excludedDates?.has(dayKey) ?? false;
    return isPast && isMissed && !isExcluded;
  });
}
