import { describe, it, expect } from "vitest";
import {
  LEGACY_DAY_TYPE_BEHAVIOR,
  behaviorAllowsLogging,
  behaviorAssignsTarget,
  behaviorCountsAsMissed,
  behaviorGivesCatchUpCapacity,
  buildDayBehaviorMap,
  buildScheduleNoteMap,
  labelsById,
  resolveDayLabel,
  scheduleChapterTargets,
  schedulePlannedPages,
  type DayLabelLike,
} from "./scheduleDayType";

const labels: DayLabelLike[] = [
  { _id: "l1", name: "Reading", behavior: "reading" },
  { _id: "l2", name: "Sabbath", behavior: "off" },
  { _id: "l3", name: "Recap", behavior: "flex" },
];
const byId = labelsById(labels);

describe("legacy dayType resolution", () => {
  // These four rows exist in production today. Their meaning must not shift.
  it.each([
    ["reading", "reading", "Reading", true],
    ["catchup", "flex", "Catch-up", true],
    ["rest", "off", "Rest", false],
    ["reflection", "off", "Reflection", false],
  ] as const)(
    "maps legacy %s to %s and preserves loggability",
    (dayType, behavior, name, loggable) => {
      const resolved = resolveDayLabel({ date: "2026-07-20", dayType }, byId);
      expect(resolved.behavior).toBe(behavior);
      expect(resolved.name).toBe(name);
      // Reproduces the old dayTypeAllowsReading truth table exactly.
      expect(behaviorAllowsLogging(resolved.behavior)).toBe(loggable);
      expect(LEGACY_DAY_TYPE_BEHAVIOR[dayType]).toBe(behavior);
    }
  );

  it("falls back to a reading day for unknown or missing values", () => {
    expect(resolveDayLabel(undefined, byId).behavior).toBe("reading");
    expect(resolveDayLabel({ date: "d" }, byId).behavior).toBe("reading");
    expect(
      resolveDayLabel({ date: "d", dayType: "nonsense" }, byId).behavior
    ).toBe("reading");
  });

  it("falls back to the legacy dayType when the label id is unknown", () => {
    const resolved = resolveDayLabel(
      { date: "d", dayLabelId: "deleted", dayType: "rest" },
      byId
    );
    expect(resolved.behavior).toBe("off");
  });
});

describe("custom labels", () => {
  it("resolves by id", () => {
    const resolved = resolveDayLabel({ date: "d", dayLabelId: "l2" }, byId);
    expect(resolved).toMatchObject({ name: "Sabbath", behavior: "off" });
  });

  it("still resolves a label after it is archived", () => {
    // Archiving hides a label from pickers; days already assigned to it must
    // keep their name, or a saved "Sabbath" silently reverts to "Rest".
    const withArchived = labelsById([
      ...labels,
      { _id: "l4", name: "Sabbath", behavior: "off", isArchived: true },
    ]);
    expect(
      resolveDayLabel({ date: "d", dayLabelId: "l4", dayType: "rest" }, withArchived)
    ).toMatchObject({ name: "Sabbath", behavior: "off" });
  });

  it("lets dayLabelId win over a shadow-written legacy dayType", () => {
    // Writes shadow `dayType` for rollback safety; the label must still win.
    const resolved = resolveDayLabel(
      { date: "d", dayLabelId: "l3", dayType: "rest" },
      byId
    );
    expect(resolved.name).toBe("Recap");
    expect(resolved.behavior).toBe("flex");
  });
});

describe("behavior predicates", () => {
  it("only reading days assign targets and can be missed", () => {
    expect(behaviorAssignsTarget("reading")).toBe(true);
    expect(behaviorAssignsTarget("flex")).toBe(false);
    expect(behaviorAssignsTarget("off")).toBe(false);

    expect(behaviorCountsAsMissed("reading")).toBe(true);
    expect(behaviorCountsAsMissed("flex")).toBe(false);
    expect(behaviorCountsAsMissed("off")).toBe(false);
  });

  it("reading and flex days give catch-up capacity, off days do not", () => {
    expect(behaviorGivesCatchUpCapacity("reading")).toBe(true);
    expect(behaviorGivesCatchUpCapacity("flex")).toBe(true);
    expect(behaviorGivesCatchUpCapacity("off")).toBe(false);
  });
});

describe("schedule maps", () => {
  const schedule = [
    {
      date: "2026-07-08",
      dayLabelId: "l1",
      chapterNumber: 2,
      plannedPages: 20,
      notes: "  Discuss chapters 1–2  ",
    },
    { date: "2026-07-09", dayLabelId: "l2", chapterNumber: 9, plannedPages: 99 },
    {
      date: "2026-07-10",
      dayLabelId: "l3",
      chapterNumber: 9,
      plannedPages: 99,
      notes: "   ",
    },
    { date: "2026-07-11", dayType: "reading", chapterNumber: 4, plannedPages: 30 },
  ];

  it("only exposes targets from days that assign them", () => {
    expect([...scheduleChapterTargets(schedule, labels)]).toEqual([
      ["2026-07-08", 2],
      ["2026-07-11", 4],
    ]);
    expect([...schedulePlannedPages(schedule, labels)]).toEqual([
      ["2026-07-08", 20],
      ["2026-07-11", 30],
    ]);
  });

  it("maps every scheduled day to a behavior", () => {
    expect([...buildDayBehaviorMap(schedule, labels)]).toEqual([
      ["2026-07-08", "reading"],
      ["2026-07-09", "off"],
      ["2026-07-10", "flex"],
      ["2026-07-11", "reading"],
    ]);
  });

  it("exposes only non-empty admin notes and trims their display text", () => {
    expect([...buildScheduleNoteMap(schedule)]).toEqual([
      ["2026-07-08", "Discuss chapters 1–2"],
    ]);
  });
});
