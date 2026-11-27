import {
  addDays,
  differenceInCalendarDays,
  endOfWeek,
  format,
  parse,
  startOfWeek,
  subYears,
} from "date-fns";

/** One day of logged reading, aggregated across all of a reader's books. */
export type DayActivity = {
  date: string; // yyyy-MM-dd
  books: number; // distinct books marked read that day
  pages: number;
  /** Titles the viewer may see (all for the owner, public ones for visitors). */
  titles?: string[];
  /** Books read that day whose titles are hidden from this viewer. */
  privateBooks?: number;
};

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export type HeatmapCell = {
  date: string;
  books: number;
  pages: number;
  titles: string[];
  privateBooks: number;
  level: HeatmapLevel;
  /** False for padding days before/after the range that complete a week. */
  inRange: boolean;
};

export type HeatmapRange = "last-year" | number;

const DATE_FORMAT = "yyyy-MM-dd";

const toKey = (date: Date) => format(date, DATE_FORMAT);
const fromKey = (key: string) => parse(key, DATE_FORMAT, new Date());

/** First and last day covered by a range, relative to `today`. */
export function getRangeBounds(
  range: HeatmapRange,
  today: Date
): { start: Date; end: Date } {
  if (range === "last-year") {
    return { start: addDays(subYears(today, 1), 1), end: today };
  }
  return { start: new Date(range, 0, 1), end: new Date(range, 11, 31) };
}

/**
 * Quartile thresholds over the non-zero values, like GitHub's contribution
 * graph: the busiest quarter of active days gets the darkest colour.
 */
function getThresholds(values: number[]): [number, number, number] {
  const sorted = values.filter((value) => value > 0).sort((a, b) => a - b);
  if (sorted.length === 0) return [0, 0, 0];
  const at = (q: number) =>
    sorted[Math.max(0, Math.ceil(q * sorted.length) - 1)];
  return [at(0.25), at(0.5), at(0.75)];
}

function levelFor(
  value: number,
  [q1, q2, q3]: [number, number, number]
): HeatmapLevel {
  if (value <= 0) return 0;
  if (value <= q1) return 1;
  if (value <= q2) return 2;
  if (value <= q3) return 3;
  return 4;
}

/**
 * Lays activity out as week columns (Sunday → Saturday), padded to whole weeks.
 * Colour intensity follows pages read; days logged without pages (chapter-only
 * books) still show as the lightest active shade.
 */
export function buildHeatmap(
  activity: DayActivity[],
  range: HeatmapRange,
  today: Date = new Date()
) {
  const { start, end } = getRangeBounds(range, today);
  const startKey = toKey(start);
  const endKey = toKey(end);
  // Nothing after today can have been read yet.
  const lastActiveKey = endKey < toKey(today) ? endKey : toKey(today);

  const byDate = new Map(activity.map((day) => [day.date, day]));
  const inRangeDays = activity.filter(
    (day) => day.date >= startKey && day.date <= lastActiveKey && day.books > 0
  );

  const usePages = inRangeDays.some((day) => day.pages > 0);
  const thresholds = getThresholds(
    inRangeDays.map((day) => (usePages ? day.pages : day.books))
  );

  const gridStart = startOfWeek(start, { weekStartsOn: 0 });
  const gridEnd = endOfWeek(end, { weekStartsOn: 0 });
  const totalDays = differenceInCalendarDays(gridEnd, gridStart) + 1;

  const weeks: HeatmapCell[][] = [];
  for (let offset = 0; offset < totalDays; offset++) {
    const date = addDays(gridStart, offset);
    const key = toKey(date);
    const inRange = key >= startKey && key <= endKey;
    const day = inRange && key <= lastActiveKey ? byDate.get(key) : undefined;
    const books = day?.books ?? 0;
    const pages = day?.pages ?? 0;
    let level: HeatmapLevel = 0;
    if (books > 0) {
      level = usePages
        ? pages > 0
          ? levelFor(pages, thresholds)
          : 1
        : levelFor(books, thresholds);
    }
    if (offset % 7 === 0) weeks.push([]);
    weeks[weeks.length - 1].push({
      date: key,
      books,
      pages,
      titles: day?.titles ?? [],
      privateBooks: day?.privateBooks ?? 0,
      level,
      inRange,
    });
  }

  // A month label sits above the first week whose first in-range day falls in
  // a new month. Drop a leading label that would collide with the next one.
  const monthLabels: { weekIndex: number; label: string }[] = [];
  let lastMonth = -1;
  weeks.forEach((week, weekIndex) => {
    const firstDay = week.find((cell) => cell.inRange);
    if (!firstDay) return;
    const month = fromKey(firstDay.date).getMonth();
    if (month !== lastMonth) {
      monthLabels.push({
        weekIndex,
        label: format(fromKey(firstDay.date), "MMM"),
      });
      lastMonth = month;
    }
  });
  if (monthLabels.length > 1 && monthLabels[1].weekIndex - monthLabels[0].weekIndex < 3) {
    monthLabels.shift();
  }

  return {
    weeks,
    monthLabels,
    readingDays: inRangeDays.length,
    pages: inRangeDays.reduce((sum, day) => sum + day.pages, 0),
  };
}

/**
 * Current streak counts back from today, or from yesterday when today hasn't
 * been logged yet (so a streak doesn't read as broken first thing in the
 * morning). Longest streak is over all logged history.
 */
export function getStreaks(activity: DayActivity[], today: Date = new Date()) {
  const readDates = new Set(
    activity.filter((day) => day.books > 0).map((day) => day.date)
  );

  let current = 0;
  let cursor = readDates.has(toKey(today)) ? today : addDays(today, -1);
  while (readDates.has(toKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const todayKey = toKey(today);
  const sorted = Array.from(readDates)
    .filter((date) => date <= todayKey)
    .sort();
  let longest = 0;
  let run = 0;
  let previous: Date | null = null;
  for (const key of sorted) {
    const date = fromKey(key);
    run =
      previous && differenceInCalendarDays(date, previous) === 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    previous = date;
  }

  return { current, longest };
}

/** Years that have any logged reading, plus the current year, newest first. */
export function getActivityYears(
  activity: DayActivity[],
  today: Date = new Date()
): number[] {
  const years = new Set<number>([today.getFullYear()]);
  for (const day of activity) {
    if (day.books > 0) years.add(Number(day.date.slice(0, 4)));
  }
  return Array.from(years)
    .filter((year) => year <= today.getFullYear())
    .sort((a, b) => b - a);
}
