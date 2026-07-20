import {
  BookOpen,
  Coffee,
  Sparkles,
  CalendarDays,
  Moon,
  Users,
  Heart,
  Mic,
  PenLine,
  Star,
  type LucideIcon,
} from "lucide-react";

/**
 * What a schedule day means to the reading/catch-up engine. Communities choose
 * the *name* of a day freely; the behavior is one of these three so every
 * computation has bounded, well-defined semantics.
 *
 * reading — assigns a target, loggable, unlogged days count as missed.
 * flex    — no target, loggable, never counted as missed, but counts as
 *           capacity when working out how fast a member must catch up.
 * off     — nothing expected; ignored by progress and catch-up math entirely.
 */
export type DayBehavior = "reading" | "flex" | "off";

export const DAY_BEHAVIORS: DayBehavior[] = ["reading", "flex", "off"];

/** Admin-facing explanation of each behavior, used by the settings UI. */
export const DAY_BEHAVIOR_HELP: Record<
  DayBehavior,
  { label: string; description: string }
> = {
  reading: {
    label: "Reading",
    description:
      "Members get a target for this day, can log it, and skipping it counts as a missed day.",
  },
  flex: {
    label: "Flexible",
    description:
      "No target assigned, but members can still log reading. Skipping it is never counted as missed — it gives them room to catch up.",
  },
  off: {
    label: "Off",
    description:
      "Nothing is expected. The day is ignored by progress tracking and catch-up suggestions, and can't be marked read.",
  },
};

/**
 * Legacy `communityBookSchedule.dayType` values, mapped to the behavior that
 * reproduces their old meaning exactly. Rows written before day labels existed
 * resolve through this table, so schedules stay correct with or without the
 * backfill having run.
 */
export const LEGACY_DAY_TYPE_BEHAVIOR: Record<string, DayBehavior> = {
  reading: "reading",
  catchup: "flex",
  rest: "off",
  reflection: "off",
};

/** Display names matching the four labels seeded for every community. */
export const LEGACY_DAY_TYPE_NAME: Record<string, string> = {
  reading: "Reading",
  catchup: "Catch-up",
  rest: "Rest",
  reflection: "Reflection",
};

/** Icon each seeded default uses, and the key stored on its label row. */
export const LEGACY_DAY_TYPE_ICON: Record<string, string> = {
  reading: "book-open",
  catchup: "calendar-days",
  rest: "coffee",
  reflection: "sparkles",
};

/**
 * Icons an admin can pick from. A fixed registry rather than free-form input so
 * a label can never reference an icon this build doesn't ship.
 */
export const DAY_ICONS: Record<string, LucideIcon> = {
  "book-open": BookOpen,
  coffee: Coffee,
  sparkles: Sparkles,
  "calendar-days": CalendarDays,
  moon: Moon,
  users: Users,
  heart: Heart,
  mic: Mic,
  "pen-line": PenLine,
  star: Star,
};

const DEFAULT_ICON_FOR_BEHAVIOR: Record<DayBehavior, string> = {
  reading: "book-open",
  flex: "calendar-days",
  off: "coffee",
};

export function dayIconFor(
  iconKey: string | undefined,
  behavior: DayBehavior
): LucideIcon {
  return (
    (iconKey ? DAY_ICONS[iconKey] : undefined) ??
    DAY_ICONS[DEFAULT_ICON_FOR_BEHAVIOR[behavior]]
  );
}

export function behaviorAssignsTarget(behavior: DayBehavior) {
  return behavior === "reading";
}

/**
 * Day types a member can log reading against. Flexible days carry no new
 * assignment, but members are meant to read on them to catch up, so they allow
 * logging just like reading days. Off days do not.
 */
export function behaviorAllowsLogging(behavior: DayBehavior) {
  return behavior !== "off";
}

/** Only a skipped *reading* day is a missed day. */
export function behaviorCountsAsMissed(behavior: DayBehavior) {
  return behavior === "reading";
}

/** Days a member can use to catch up: reading days plus flexible ones. */
export function behaviorGivesCatchUpCapacity(behavior: DayBehavior) {
  return behavior !== "off";
}

export type DayLabelLike = {
  _id: string;
  name: string;
  behavior: DayBehavior;
  icon?: string;
  isArchived?: boolean;
};

export type ScheduleEntryLike = {
  date: string;
  dayLabelId?: string | null;
  /** Legacy fallback for rows written before day labels */
  dayType?: string | null;
  chapterNumber?: number | null;
  plannedPages?: number | null;
};

export type ResolvedDayLabel = {
  name: string;
  behavior: DayBehavior;
  icon?: string;
};

/** What a day means when the schedule says nothing about it. */
export const DEFAULT_DAY_LABEL: ResolvedDayLabel = {
  name: LEGACY_DAY_TYPE_NAME.reading,
  behavior: "reading",
  icon: LEGACY_DAY_TYPE_ICON.reading,
};

const FALLBACK_LABEL = DEFAULT_DAY_LABEL;

export function labelsById(
  labels: DayLabelLike[] | undefined
): Map<string, DayLabelLike> {
  return new Map((labels ?? []).map((label) => [label._id, label]));
}

/**
 * Resolves what a schedule day is for. `dayLabelId` wins; rows predating day
 * labels fall back to their legacy `dayType`; anything unrecognised is treated
 * as a plain reading day, which is what the app assumed before this existed.
 */
export function resolveDayLabel(
  entry: ScheduleEntryLike | undefined,
  byId: Map<string, DayLabelLike>
): ResolvedDayLabel {
  if (!entry) return FALLBACK_LABEL;

  if (entry.dayLabelId) {
    const label = byId.get(entry.dayLabelId);
    if (label) {
      return { name: label.name, behavior: label.behavior, icon: label.icon };
    }
  }

  const legacy = entry.dayType ?? undefined;
  if (legacy && legacy in LEGACY_DAY_TYPE_BEHAVIOR) {
    return {
      name: LEGACY_DAY_TYPE_NAME[legacy],
      behavior: LEGACY_DAY_TYPE_BEHAVIOR[legacy],
      icon: LEGACY_DAY_TYPE_ICON[legacy],
    };
  }

  return FALLBACK_LABEL;
}

export function resolveDayBehavior(
  entry: ScheduleEntryLike | undefined,
  byId: Map<string, DayLabelLike>
): DayBehavior {
  return resolveDayLabel(entry, byId).behavior;
}

/** date -> resolved label, for every day the schedule covers. */
export function buildDayLabelMap(
  schedule: ScheduleEntryLike[] | undefined,
  labels: DayLabelLike[] | undefined
): Map<string, ResolvedDayLabel> {
  const byId = labelsById(labels);
  const map = new Map<string, ResolvedDayLabel>();
  (schedule ?? []).forEach((entry) => {
    map.set(entry.date, resolveDayLabel(entry, byId));
  });
  return map;
}

/** date -> behavior, for every day the schedule covers. */
export function buildDayBehaviorMap(
  schedule: ScheduleEntryLike[] | undefined,
  labels: DayLabelLike[] | undefined
): Map<string, DayBehavior> {
  const byId = labelsById(labels);
  const map = new Map<string, DayBehavior>();
  (schedule ?? []).forEach((entry) => {
    map.set(entry.date, resolveDayBehavior(entry, byId));
  });
  return map;
}

/**
 * Maps each community-schedule reading day to the admin's target chapter, so a
 * member's book follows the schedule verbatim instead of a locally recomputed
 * distribution. Non-reading days and days without a chapter are omitted.
 */
export function scheduleChapterTargets(
  schedule: ScheduleEntryLike[] | undefined,
  labels?: DayLabelLike[]
): Map<string, number> {
  const byId = labelsById(labels);
  const map = new Map<string, number>();
  (schedule ?? []).forEach((entry) => {
    if (
      behaviorAssignsTarget(resolveDayBehavior(entry, byId)) &&
      entry.chapterNumber != null
    ) {
      map.set(entry.date, entry.chapterNumber);
    }
  });
  return map;
}

/** Same as above for page-based books. */
export function schedulePlannedPages(
  schedule: ScheduleEntryLike[] | undefined,
  labels?: DayLabelLike[]
): Map<string, number> {
  const byId = labelsById(labels);
  const map = new Map<string, number>();
  (schedule ?? []).forEach((entry) => {
    if (
      behaviorAssignsTarget(resolveDayBehavior(entry, byId)) &&
      entry.plannedPages != null
    ) {
      map.set(entry.date, entry.plannedPages);
    }
  });
  return map;
}
