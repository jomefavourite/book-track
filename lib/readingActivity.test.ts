import { describe, expect, it } from "vitest";
import {
  buildHeatmap,
  getActivityYears,
  getStreaks,
  type DayActivity,
} from "./readingActivity";

const today = new Date(2026, 10, 26); // Thu 26 Nov 2026

describe("buildHeatmap", () => {
  it("pads the last-year range to whole Sunday-start weeks", () => {
    const { weeks } = buildHeatmap([], "last-year", today);
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(weeks[0][0].date).toBe("2025-11-23"); // Sunday on/before 27 Nov 2025
    expect(weeks[0].find((cell) => cell.inRange)?.date).toBe("2025-11-27");
    const lastWeek = weeks[weeks.length - 1];
    expect(lastWeek[lastWeek.length - 1].date).toBe("2026-11-28");
    expect(lastWeek.find((cell) => cell.date === "2026-11-27")?.inRange).toBe(
      false
    );
  });

  it("covers a calendar year when a year is picked", () => {
    const { weeks, monthLabels } = buildHeatmap([], 2025, today);
    const inRange = weeks.flat().filter((cell) => cell.inRange);
    expect(inRange[0].date).toBe("2025-01-01");
    expect(inRange[inRange.length - 1].date).toBe("2025-12-31");
    expect(inRange).toHaveLength(365);
    expect(monthLabels.map((label) => label.label)).toEqual([
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ]);
  });

  it("scales colour by pages and keeps page-less days at level 1", () => {
    const activity: DayActivity[] = [
      { date: "2026-11-01", books: 1, pages: 5 },
      { date: "2026-11-02", books: 1, pages: 10 },
      { date: "2026-11-03", books: 1, pages: 20 },
      { date: "2026-11-04", books: 2, pages: 80 },
      { date: "2026-11-05", books: 1, pages: 0 },
    ];
    const { weeks, readingDays, pages } = buildHeatmap(
      activity,
      "last-year",
      today
    );
    const level = (date: string) =>
      weeks.flat().find((cell) => cell.date === date)?.level;
    expect(level("2026-11-01")).toBe(1);
    expect(level("2026-11-04")).toBe(4);
    expect(level("2026-11-05")).toBe(1);
    expect(level("2026-11-06")).toBe(0);
    expect(readingDays).toBe(5);
    expect(pages).toBe(115);
  });

  it("ignores reading logged after today", () => {
    const { weeks, readingDays } = buildHeatmap(
      [{ date: "2026-11-27", books: 1, pages: 10 }],
      2026,
      today
    );
    expect(readingDays).toBe(0);
    expect(weeks.flat().find((c) => c.date === "2026-11-27")?.level).toBe(0);
  });
});

describe("getStreaks", () => {
  const day = (date: string): DayActivity => ({ date, books: 1, pages: 1 });

  it("keeps the current streak alive when today isn't logged yet", () => {
    const { current } = getStreaks(
      [day("2026-11-23"), day("2026-11-24"), day("2026-11-25")],
      today
    );
    expect(current).toBe(3);
  });

  it("breaks the current streak after a missed day", () => {
    const { current } = getStreaks([day("2026-11-24")], today);
    expect(current).toBe(0);
  });

  it("finds the longest run across history", () => {
    const { longest } = getStreaks(
      [
        day("2026-01-01"),
        day("2026-01-02"),
        day("2026-01-03"),
        day("2026-01-04"),
        day("2026-03-10"),
        day("2026-11-26"),
      ],
      today
    );
    expect(longest).toBe(4);
  });
});

describe("getActivityYears", () => {
  it("lists active years plus the current one, newest first", () => {
    expect(
      getActivityYears(
        [
          { date: "2024-05-01", books: 1, pages: 3 },
          { date: "2025-02-01", books: 0, pages: 0 },
        ],
        today
      )
    ).toEqual([2026, 2024]);
  });
});
