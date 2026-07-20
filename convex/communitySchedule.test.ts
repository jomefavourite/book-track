import { describe, it, expect } from "vitest";
import { buildSessionsFromSchedule, resolveEntryBehavior } from "./communitySchedule";
import {
  BEHAVIOR_LEGACY_DAY_TYPE,
  DEFAULT_DAY_LABELS,
  LEGACY_DAY_TYPE_BEHAVIOR as CONVEX_LEGACY,
  type DayBehavior,
} from "./dayBehavior";
import { LEGACY_DAY_TYPE_BEHAVIOR as LIB_LEGACY } from "../lib/scheduleDayType";

type Entry = Parameters<typeof buildSessionsFromSchedule>[1][number];

const labels = new Map<string, { behavior: DayBehavior; name: string }>([
  ["l1", { behavior: "reading", name: "Reading" }],
  ["l2", { behavior: "off", name: "Sabbath" }],
  ["l3", { behavior: "flex", name: "Recap" }],
]);

const book = { totalPages: 300, ignorePages: undefined };

// `convex/dayBehavior.ts` duplicates `lib/scheduleDayType.ts` because Convex
// runs under its own tsconfig. Nothing stops the two drifting, so pin them.
describe("convex/lib mirror", () => {
  it("agrees with lib on every legacy mapping", () => {
    expect(CONVEX_LEGACY).toEqual(LIB_LEGACY);
  });

  it("round-trips every behavior through the shadow-written legacy type", () => {
    for (const [behavior, legacy] of Object.entries(BEHAVIOR_LEGACY_DAY_TYPE)) {
      expect(CONVEX_LEGACY[legacy]).toBe(behavior);
    }
  });

  it("seeds one default per legacy day type, with matching behavior", () => {
    expect(DEFAULT_DAY_LABELS.map((d) => d.legacyDayType).sort()).toEqual(
      Object.keys(CONVEX_LEGACY).sort()
    );
    for (const preset of DEFAULT_DAY_LABELS) {
      expect(preset.behavior).toBe(CONVEX_LEGACY[preset.legacyDayType]);
    }
  });
});

describe("resolveEntryBehavior", () => {
  it("prefers the label over the shadow-written legacy dayType", () => {
    expect(
      resolveEntryBehavior({ dayLabelId: "l2" as never, dayType: "reading" }, labels)
    ).toMatchObject({ behavior: "off", name: "Sabbath" });
  });

  it("falls back to legacy dayType when no labels exist at all", () => {
    // The pre-backfill state: rows have dayType, the table has no labels yet.
    const empty = new Map<string, { behavior: DayBehavior; name: string }>();
    expect(resolveEntryBehavior({ dayType: "rest" }, empty).behavior).toBe("off");
    expect(resolveEntryBehavior({ dayType: "catchup" }, empty).behavior).toBe("flex");
    expect(resolveEntryBehavior({ dayType: "reading" }, empty).behavior).toBe("reading");
    expect(resolveEntryBehavior({ dayType: "reflection" }, empty).behavior).toBe("off");
  });

  it("treats unknown and missing values as reading days", () => {
    expect(resolveEntryBehavior(undefined, labels).behavior).toBe("reading");
    expect(resolveEntryBehavior({}, labels).behavior).toBe("reading");
    expect(resolveEntryBehavior({ dayType: "bogus" }, labels).behavior).toBe("reading");
    // A label deleted out from under a row still resolves via its legacy type.
    expect(
      resolveEntryBehavior({ dayLabelId: "gone" as never, dayType: "rest" }, labels)
        .behavior
    ).toBe("off");
  });
});

describe("buildSessionsFromSchedule", () => {
  const schedule: Entry[] = [
    { date: "2026-07-08", dayLabelId: "l1" as never },
    { date: "2026-07-09", dayLabelId: "l2" as never }, // Sabbath
    { date: "2026-07-10", dayLabelId: "l3" as never }, // Recap (flex)
    { date: "2026-07-11", dayLabelId: "l1" as never },
  ];

  it("splits pages across reading days only", () => {
    const planned = buildSessionsFromSchedule(book, schedule, labels);
    expect(planned.map((p) => p.plannedPages)).toEqual([150, 0, 0, 150]);
    expect(planned.map((p) => p.date)).toEqual(schedule.map((e) => e.date));
  });

  it("gives flexible and off days no target, matching the old rest/catchup rule", () => {
    const planned = buildSessionsFromSchedule(book, schedule, labels);
    expect(planned[1]).toMatchObject({ plannedPages: 0, chapterNumber: undefined });
    expect(planned[2]).toMatchObject({ plannedPages: 0, chapterNumber: undefined });
  });

  it("honors explicit per-day targets and carries chapters on reading days", () => {
    const withTargets: Entry[] = [
      { date: "d1", dayLabelId: "l1" as never, plannedPages: 40, chapterNumber: 3 },
      { date: "d2", dayLabelId: "l2" as never, plannedPages: 99, chapterNumber: 9 },
    ];
    const planned = buildSessionsFromSchedule(book, withTargets, labels);
    expect(planned[0]).toMatchObject({ plannedPages: 40, chapterNumber: 3 });
    // An off day never inherits a stale target, even if one is stored.
    expect(planned[1]).toMatchObject({ plannedPages: 0, chapterNumber: undefined });
  });

  it("produces the pre-migration result for legacy rows with no labels", () => {
    // Same shape as the old hardcoded dayType path; this is what existing
    // members' sessions were built from and must keep being built from.
    const legacy: Entry[] = [
      { date: "d1", dayType: "reading" },
      { date: "d2", dayType: "rest" },
      { date: "d3", dayType: "reflection" },
      { date: "d4", dayType: "catchup" },
      { date: "d5", dayType: "reading" },
    ];
    const planned = buildSessionsFromSchedule(
      book,
      legacy,
      new Map() // no labels seeded yet
    );
    expect(planned.map((p) => p.plannedPages)).toEqual([150, 0, 0, 0, 150]);
  });

  it("assigns nothing when the book ignores pages", () => {
    const planned = buildSessionsFromSchedule(
      { totalPages: 300, ignorePages: true },
      schedule,
      labels
    );
    expect(planned.every((p) => p.plannedPages === 0)).toBe(true);
  });
});
