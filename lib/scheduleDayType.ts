import { BookOpen, Coffee, Sparkles, CalendarDays } from "lucide-react";

export type ScheduleDayType = "reading" | "rest" | "reflection" | "catchup";

export const DAY_TYPE_META: Record<
  ScheduleDayType,
  { label: string; icon: typeof BookOpen }
> = {
  reading: { label: "Reading", icon: BookOpen },
  rest: { label: "Rest", icon: Coffee },
  reflection: { label: "Reflection", icon: Sparkles },
  catchup: { label: "Catch-up", icon: CalendarDays },
};

/**
 * Day types a member can log reading against. Catch-up days carry no new
 * assignment, but members are meant to read on them to catch up, so they allow
 * logging just like reading days. Rest and reflection days do not.
 */
export function dayTypeAllowsReading(dayType: ScheduleDayType) {
  return dayType === "reading" || dayType === "catchup";
}

export type ScheduleTargetEntry = {
  date: string;
  dayType: ScheduleDayType;
  chapterNumber?: number | null;
};

/**
 * Maps each community-schedule reading day to the admin's target chapter, so a
 * member's book follows the schedule verbatim instead of a locally recomputed
 * distribution. Non-reading days and days without a chapter are omitted.
 */
export function scheduleChapterTargets(
  schedule: ScheduleTargetEntry[] | undefined
): Map<string, number> {
  const map = new Map<string, number>();
  (schedule ?? []).forEach((entry) => {
    if (entry.dayType === "reading" && entry.chapterNumber != null) {
      map.set(entry.date, entry.chapterNumber);
    }
  });
  return map;
}
