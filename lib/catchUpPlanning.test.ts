import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  computeCatchUpSuggestion,
  type CatchUpSchedule,
  type CatchUpSessionInput,
} from "./catchUpPlanning";
import type { DayBehavior } from "./scheduleDayType";

// Fixed "today" so the missed/remaining split is deterministic.
const TODAY = new Date(2026, 6, 20); // Mon 20 Jul 2026

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(TODAY);
});
afterEach(() => {
  vi.useRealTimers();
});

const chapterBook = {
  startDate: "2026-07-08",
  endDate: "2026-07-31",
  totalChapters: 20,
  progressStyle: "chapters" as const,
  ignorePages: true,
};

/** Chapters 1-3 logged on the first three days, nothing since. */
const chapterSessions: CatchUpSessionInput[] = [
  { date: "2026-07-08", isRead: true, plannedPages: 0, chapterNumber: 1 },
  { date: "2026-07-09", isRead: true, plannedPages: 0, chapterNumber: 2 },
  { date: "2026-07-11", isRead: true, plannedPages: 0, chapterNumber: 3 },
];

const READ_DATES = new Set(chapterSessions.map((s) => s.date));

/**
 * The screenshot's schedule: Mon/Wed/Thu read, Tue/Sun rest, Fri reflection,
 * Sat catch-up — with chapter targets climbing 1..20 across the reading days.
 */
function buildScreenshotSchedule(): CatchUpSchedule {
  const behaviorByDate = new Map<string, DayBehavior>();
  const chapterTargetByDate = new Map<string, number>();
  const readingDates: string[] = [];

  for (let day = 8; day <= 31; day++) {
    const date = new Date(2026, 6, day);
    const key = `2026-07-${String(day).padStart(2, "0")}`;
    const weekday = date.getDay(); // 0 Sun .. 6 Sat
    let behavior: DayBehavior;
    if (weekday === 0 || weekday === 2) behavior = "off"; // Sun, Tue — rest
    else if (weekday === 5) behavior = "off"; // Fri — reflection
    else if (weekday === 6) behavior = "flex"; // Sat — catch-up
    else behavior = "reading"; // Mon, Wed, Thu
    behaviorByDate.set(key, behavior);
    if (behavior === "reading") readingDates.push(key);
  }

  readingDates.forEach((key, index) => {
    chapterTargetByDate.set(
      key,
      Math.min(20, Math.ceil(((index + 1) * 20) / readingDates.length))
    );
  });

  return {
    behaviorByDate,
    chapterTargetByDate,
    plannedPagesByDate: new Map(),
  };
}

describe("without a schedule (personal books)", () => {
  // Guards the personal-book path: this is the pre-existing behavior and it
  // must not drift when community books gain schedule awareness.
  it("counts every calendar day and uses an even chapter split", () => {
    const result = computeCatchUpSuggestion(chapterBook, chapterSessions);
    expect(result).not.toBeNull();
    expect(result!.type).toBe("catchup");
    // Jul 8-19 is 12 past days; 3 were read, so 9 were missed.
    expect(result!.message).toContain("You've missed 9 day(s)");
    // Remaining days = every calendar day from Jul 20 to Jul 31 = 12.
    expect(result).toMatchObject({ remainingDays: 12, remainingChapters: 17 });
    // The exact pre-existing output: 3 + ceil(17/12) = 5. This is the number
    // the screenshot showed, and personal books must keep producing it.
    expect(result!.message).toBe(
      "You've missed 9 day(s). To catch up, reach Chapter 5 today."
    );
  });

  it("returns null once the reader is at or past the expected chapter", () => {
    const caughtUp: CatchUpSessionInput[] = [
      { date: "2026-07-08", isRead: true, plannedPages: 0, chapterNumber: 20 },
    ];
    expect(computeCatchUpSuggestion(chapterBook, caughtUp)).toBeNull();
  });

  it("returns null for a book already marked complete", () => {
    expect(
      computeCatchUpSuggestion(
        { ...chapterBook, markedCompleteAt: 1 },
        chapterSessions
      )
    ).toBeNull();
  });
});

describe("with a community schedule", () => {
  const schedule = buildScreenshotSchedule();

  it("does not count off days as missed", () => {
    const result = computeCatchUpSuggestion(
      chapterBook,
      chapterSessions,
      schedule
    );
    expect(result).not.toBeNull();

    // Only past *reading* days that went unlogged should count.
    const expectedMissed = [...schedule.behaviorByDate.entries()].filter(
      ([date, behavior]) =>
        behavior === "reading" && date < "2026-07-20" && !READ_DATES.has(date)
    ).length;

    expect(result!.message).toContain(
      `You've missed ${expectedMissed} day(s)`
    );
    // Strictly fewer than the 9 the schedule-blind version reports.
    expect(expectedMissed).toBeLessThan(9);
  });

  it("counts flex days as capacity but never as missed", () => {
    const result = computeCatchUpSuggestion(
      chapterBook,
      chapterSessions,
      schedule
    );

    const capacityDays = [...schedule.behaviorByDate.entries()].filter(
      ([date, behavior]) => date >= "2026-07-20" && behavior !== "off"
    ).length;
    expect(result).toMatchObject({ remainingDays: capacityDays });

    // Off days are excluded, so capacity is below the raw 12 calendar days.
    expect(capacityDays).toBeLessThan(12);

    // A schedule where the only unlogged past days are flex reports nothing
    // missed, and therefore no suggestion at all.
    const flexOnly: CatchUpSchedule = {
      ...schedule,
      behaviorByDate: new Map(
        [...schedule.behaviorByDate.entries()].map(([date, behavior]) => [
          date,
          READ_DATES.has(date) ? behavior : ("flex" as DayBehavior),
        ])
      ),
    };
    expect(
      computeCatchUpSuggestion(chapterBook, chapterSessions, flexOnly)
    ).toBeNull();
  });

  it("takes the expected chapter from the schedule, not an even split", () => {
    const result = computeCatchUpSuggestion(
      chapterBook,
      chapterSessions,
      schedule
    );
    expect(result).not.toBeNull();

    // Where the admin's schedule says they should be by today.
    const scheduledByToday = Math.max(
      ...[...schedule.chapterTargetByDate.entries()]
        .filter(([date]) => date <= "2026-07-20")
        .map(([, target]) => target)
    );

    const suggested = Number(
      /reach Chapter (\d+) today/.exec(result!.message)![1]
    );
    // Never suggests less than the plan already expects.
    expect(suggested).toBeGreaterThanOrEqual(scheduledByToday);

    // The schedule-blind version lags badly behind the real plan; this is the
    // bug the screenshot showed.
    const blind = computeCatchUpSuggestion(chapterBook, chapterSessions);
    const blindSuggested = Number(
      /reach Chapter (\d+) today/.exec(blind!.message)![1]
    );
    expect(suggested).toBeGreaterThan(blindSuggested);
  });

  it("uses scheduled page targets for page-based books", () => {
    const pageBook = {
      startDate: "2026-07-08",
      endDate: "2026-07-31",
      totalPages: 240,
    };
    const pageSchedule: CatchUpSchedule = {
      behaviorByDate: schedule.behaviorByDate,
      chapterTargetByDate: new Map(),
      plannedPagesByDate: new Map(
        [...schedule.behaviorByDate.entries()]
          .filter(([, behavior]) => behavior === "reading")
          .map(([date]) => [date, 24])
      ),
    };
    const sessions: CatchUpSessionInput[] = [
      { date: "2026-07-08", isRead: true, plannedPages: 24 },
    ];

    const result = computeCatchUpSuggestion(pageBook, sessions, pageSchedule);
    expect(result).not.toBeNull();
    expect(result).toMatchObject({ remainingPages: 240 - 24 });
    // Capacity excludes off days, so the daily ask is higher than the naive
    // "remaining pages / remaining calendar days".
    const naive = Math.ceil((240 - 24) / 12);
    const suggested = Number(/read (\d+) pages today/.exec(result!.message)![1]);
    expect(suggested).toBeGreaterThan(naive);
  });
});
