import { v } from "convex/values";

/**
 * Server-side mirror of the behavior helpers in `lib/scheduleDayType.ts`.
 * Convex runs under its own tsconfig and cannot import from `lib/`, so this
 * follows the same duplication pattern as `convex/dateUtils.ts`. Keep the two
 * in sync — `lib/scheduleDayType.test.ts` pins the shared truth table.
 */

export type DayBehavior = "reading" | "flex" | "off";

export const dayBehaviorValidator = v.union(
  v.literal("reading"),
  v.literal("flex"),
  v.literal("off")
);

export const legacyDayTypeValidator = v.union(
  v.literal("reading"),
  v.literal("rest"),
  v.literal("reflection"),
  v.literal("catchup")
);

export type LegacyDayType = "reading" | "rest" | "reflection" | "catchup";

export const LEGACY_DAY_TYPE_BEHAVIOR: Record<string, DayBehavior> = {
  reading: "reading",
  catchup: "flex",
  rest: "off",
  reflection: "off",
};

/** The four labels seeded for every community, in display order. */
export const DEFAULT_DAY_LABELS: Array<{
  name: string;
  behavior: DayBehavior;
  icon: string;
  legacyDayType: LegacyDayType;
}> = [
  {
    name: "Reading",
    behavior: "reading",
    icon: "book-open",
    legacyDayType: "reading",
  },
  { name: "Rest", behavior: "off", icon: "coffee", legacyDayType: "rest" },
  {
    name: "Reflection",
    behavior: "off",
    icon: "sparkles",
    legacyDayType: "reflection",
  },
  {
    name: "Catch-up",
    behavior: "flex",
    icon: "calendar-days",
    legacyDayType: "catchup",
  },
];

/**
 * Legacy literal to shadow-write alongside `dayLabelId`, so a rollback to the
 * pre-day-label build still finds a sensible `dayType` on every row.
 */
export const BEHAVIOR_LEGACY_DAY_TYPE: Record<DayBehavior, LegacyDayType> = {
  reading: "reading",
  flex: "catchup",
  off: "rest",
};

export function behaviorAssignsTarget(behavior: DayBehavior) {
  return behavior === "reading";
}

export function behaviorAllowsLogging(behavior: DayBehavior) {
  return behavior !== "off";
}
