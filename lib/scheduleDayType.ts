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
