"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { format, getDay } from "date-fns";
import { ArrowLeft, Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import Navigation from "@/components/Navigation";
import CommunityThemeProvider from "@/components/CommunityThemeProvider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/use-toast";
import {
  formatDateForStorage,
  getAllDaysInRange,
  parseDateFromStorage,
} from "@/lib/dateUtils";
import {
  calculateDailyPages,
  distributeAcrossReadingDays,
  balancePageTargets,
  balanceChapterTargets,
  type BalanceDay,
} from "@/lib/readingCalculator";

type Role = "owner" | "admin" | "moderator" | "member";

type ScheduleDayType = "reading" | "rest" | "reflection" | "catchup";

type DraftDay = {
  date: string;
  dayType: ScheduleDayType;
  /** Per-day reading target: pages (page books) or target chapter (chapter books) */
  amount: string;
  /** True once the manager types a target for this day; auto-adjust preserves it. */
  locked: boolean;
  notes: string;
};

// Default target chapter to reach on the i-th reading day (0-based) of n.
function defaultChapterForReadingIndex(
  index: number,
  readingDayCount: number,
  totalChapters: number
) {
  if (readingDayCount <= 0 || totalChapters <= 0) return 1;
  return Math.min(
    totalChapters,
    Math.max(1, Math.ceil(((index + 1) * totalChapters) / readingDayCount))
  );
}

// Default per-day target (pages or target chapter) for each reading day.
function computeReadingDefaults(
  rows: Array<{ date: string; dayType: ScheduleDayType }>,
  chapterBased: boolean,
  totalPages: number,
  totalChapters: number
): Map<string, number> {
  const readingDates = rows
    .filter((row) => row.dayType === "reading")
    .map((row) => row.date);
  const pageDefaults = distributeAcrossReadingDays(
    totalPages,
    readingDates.length
  );
  const map = new Map<string, number>();
  readingDates.forEach((date, index) => {
    map.set(
      date,
      chapterBased
        ? defaultChapterForReadingIndex(index, readingDates.length, totalChapters)
        : pageDefaults[index] ?? 0
    );
  });
  return map;
}

// Fills empty reading-day targets with the even-split default, leaving any
// manually entered value untouched.
function fillReadingDefaults(
  rows: DraftDay[],
  chapterBased: boolean,
  totalPages: number,
  totalChapters: number
): DraftDay[] {
  const defaults = computeReadingDefaults(
    rows,
    chapterBased,
    totalPages,
    totalChapters
  );
  return rows.map((row) =>
    row.dayType === "reading" && row.amount.trim() === ""
      ? { ...row, amount: String(defaults.get(row.date) ?? ""), locked: false }
      : row
  );
}

const DAY_TYPE_OPTIONS: Array<{ value: ScheduleDayType; label: string }> = [
  { value: "reading", label: "Reading" },
  { value: "rest", label: "Rest" },
  { value: "reflection", label: "Reflection" },
  { value: "catchup", label: "Catch-up" },
];

const WEEKDAY_LABELS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

// date-fns getDay() returns 0 (Sun) - 6 (Sat); reindex so Monday is 0.
function toMondayFirstIndex(dateFnsDay: number) {
  return (dateFnsDay + 6) % 7;
}

function canManageBooks(role?: Role) {
  return role === "owner" || role === "admin" || role === "moderator";
}

export default function CommunityBookSchedulePageClient() {
  const params = useParams<{ slug: string; bookId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const slug = params.slug;
  const communityBookId = params.bookId as Id<"communityBooks">;

  // User edits; falls back to the derived initial draft until first edit
  const [draftEdits, setDraftEdits] = useState<DraftDay[] | null>(null);
  const [monthKey, setMonthKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Empty until the manager types a value; otherwise shows the computed average
  const [globalAmount, setGlobalAmount] = useState<string>("");

  const { data: community } = useQuery({
    ...convexQuery(api.communities.getCommunityBySlug, { slug }),
    enabled: !!slug,
  });

  const { data: book, isPending: bookPending } = useQuery({
    ...convexQuery(api.communities.getCommunityBook, { communityBookId }),
    retry: false,
  });

  const { data: schedule, isPending: schedulePending } = useQuery({
    ...convexQuery(api.communitySchedule.getScheduleForBook, {
      communityBookId,
    }),
    enabled: Boolean(book),
  });

  const viewerRole = book?.viewerRole as Role | undefined;
  const isManager = canManageBooks(viewerRole);
  const chapterBased = book?.progressStyle === "chapters";
  const unitLabel = chapterBased ? "Chapter" : "Pages";
  const totalPages = book?.totalPages ?? 0;
  const totalChapters = book?.totalChapters ?? 0;

  const initialDraft = useMemo<DraftDay[] | null>(() => {
    if (!book || schedulePending) return null;
    const savedByDate = new Map(
      (schedule ?? []).map((entry) => [entry.date, entry])
    );
    const days = getAllDaysInRange(
      parseDateFromStorage(book.startDate),
      parseDateFromStorage(book.endDate)
    );
    const rows = days.map((day) => {
      const date = formatDateForStorage(day);
      const saved = savedByDate.get(date);
      return {
        date,
        dayType: (saved?.dayType ?? "reading") as ScheduleDayType,
        saved,
      };
    });

    // Pre-fill reading days with the saved target, or the even-split default.
    const defaultByDate = computeReadingDefaults(
      rows,
      chapterBased,
      totalPages,
      totalChapters
    );

    return rows.map((row) => {
      const savedAmount = chapterBased
        ? row.saved?.chapterNumber
        : row.saved?.plannedPages;
      const amount =
        row.dayType === "reading"
          ? savedAmount !== undefined
            ? String(savedAmount)
            : String(defaultByDate.get(row.date) ?? "")
          : "";
      return {
        date: row.date,
        dayType: row.dayType,
        amount,
        locked: false,
        notes: row.saved?.notes ?? "",
      };
    });
  }, [book, schedule, schedulePending, chapterBased, totalPages, totalChapters]);

  const draft = draftEdits ?? initialDraft;

  const months = useMemo(() => {
    if (!draft) return [];
    const seen = new Map<string, string>();
    for (const day of draft) {
      const key = day.date.slice(0, 7);
      if (!seen.has(key)) {
        seen.set(key, format(parseDateFromStorage(day.date), "MMMM yyyy"));
      }
    }
    return Array.from(seen.entries()).map(([key, label]) => ({ key, label }));
  }, [draft]);

  const activeMonth = monthKey ?? months[0]?.key ?? null;
  const useMonthTabs = (draft?.length ?? 0) > 60 && months.length > 1;
  const visibleDays = useMemo(() => {
    if (!draft) return [];
    if (!useMonthTabs || !activeMonth) return draft;
    return draft.filter((day) => day.date.startsWith(activeMonth));
  }, [draft, useMonthTabs, activeMonth]);

  const readingCount =
    draft?.filter((day) => day.dayType === "reading").length ?? 0;

  // Default per-day target for each reading day of the current draft. Used to
  // show placeholders and to seed newly-toggled reading days.
  const defaultAmountByDate = draft
    ? computeReadingDefaults(draft, chapterBased, totalPages, totalChapters)
    : new Map<string, number>();

  // The computed average shown in the global "per reading day" field.
  const defaultGlobalAmount = chapterBased
    ? readingCount > 0 && totalChapters > 0
      ? Math.max(1, Math.ceil(totalChapters / readingCount))
      : 0
    : readingCount > 0
      ? calculateDailyPages(totalPages, readingCount)
      : 0;

  // Book total and how much the current per-day targets cover.
  const bookTotal = chapterBased ? totalChapters : totalPages;
  const readingDaysList = (draft ?? []).filter(
    (day) => day.dayType === "reading"
  );
  const assignedTotal = chapterBased
    ? readingDaysList.reduce(
        (max, day) => Math.max(max, Number(day.amount) || 0),
        0
      )
    : readingDaysList.reduce((sum, day) => sum + (Number(day.amount) || 0), 0);
  const coversBook = bookTotal > 0 && assignedTotal === bookTotal;
  const showAutoAdjust = bookTotal > 0 && readingCount > 0 && !coversBook;

  const weekdayTemplates = useMemo(() => {
    if (!draft) return [];
    const byWeekday: ScheduleDayType[][] = Array.from(
      { length: 7 },
      () => []
    );
    for (const day of draft) {
      const index = toMondayFirstIndex(getDay(parseDateFromStorage(day.date)));
      byWeekday[index].push(day.dayType);
    }
    return WEEKDAY_LABELS.map((label, index) => {
      const types = byWeekday[index];
      const counts = new Map<ScheduleDayType, number>();
      for (const type of types) {
        counts.set(type, (counts.get(type) ?? 0) + 1);
      }
      let mode: ScheduleDayType = "reading";
      let best = -1;
      for (const [type, count] of counts) {
        if (count > best) {
          best = count;
          mode = type;
        }
      }
      return { label, index, dayType: mode, hasDays: types.length > 0 };
    });
  }, [draft]);

  const applyWeekdayTemplate = (
    weekdayIndex: number,
    dayType: ScheduleDayType
  ) => {
    setDraftEdits((current) => {
      const base = current ?? initialDraft;
      if (!base) return current;
      const next = base.map((day) =>
        toMondayFirstIndex(getDay(parseDateFromStorage(day.date))) ===
        weekdayIndex
          ? {
              ...day,
              dayType,
              amount: dayType === "reading" ? day.amount : "",
            }
          : day
      );
      return fillReadingDefaults(next, chapterBased, totalPages, totalChapters);
    });
  };

  const { mutateAsync: saveSchedule, isPending: savePending } = useMutation({
    mutationFn: useConvexMutation(api.communitySchedule.bulkReplaceSchedule),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.communitySchedule.getScheduleForBook, {
          communityBookId,
        }).queryKey,
      });
    },
  });

  const updateDay = (date: string, patch: Partial<DraftDay>) => {
    setDraftEdits((current) => {
      const base = current ?? initialDraft;
      if (!base) return current;
      return base.map((day) =>
        day.date === date ? { ...day, ...patch } : day
      );
    });
  };

  const changeDayType = (date: string, dayType: ScheduleDayType) => {
    setDraftEdits((current) => {
      const base = current ?? initialDraft;
      if (!base) return current;
      const next = base.map((day) =>
        day.date === date
          ? {
              ...day,
              dayType,
              amount: dayType === "reading" ? day.amount : "",
              locked: dayType === "reading" ? day.locked : false,
            }
          : day
      );
      // Seed a default for the newly-reading day and keep others intact.
      return fillReadingDefaults(next, chapterBased, totalPages, totalChapters);
    });
  };

  // Chapters are cumulative, so spread them evenly: every reading day advances
  // and the last one reaches the total, with no repeated targets.
  const spreadChaptersEvenly = () => {
    setError(null);
    setDraftEdits((current) => {
      const base = current ?? initialDraft;
      if (!base) return current;
      const defaults = computeReadingDefaults(
        base,
        true,
        totalPages,
        totalChapters
      );
      return base.map((day) =>
        day.dayType === "reading"
          ? {
              ...day,
              amount: String(defaults.get(day.date) ?? day.amount),
              locked: false,
            }
          : day
      );
    });
  };

  // Pages: apply a flat per-day count to every reading day.
  const applyGlobalAmount = () => {
    const raw = (
      globalAmount.trim() !== "" ? globalAmount : String(defaultGlobalAmount)
    ).trim();
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1) {
      setError("Enter a whole number of 1 or more for pages per reading day.");
      return;
    }
    setError(null);
    setDraftEdits((current) => {
      const base = current ?? initialDraft;
      if (!base) return current;
      return base.map((day) =>
        day.dayType === "reading"
          ? { ...day, amount: raw, locked: false }
          : day
      );
    });
  };

  // Rebalances untouched reading days so the schedule covers the book total,
  // preserving days the manager explicitly edited (locked).
  const autoAdjustToTotal = () => {
    if (bookTotal <= 0) return;
    setError(null);
    setDraftEdits((current) => {
      const base = current ?? initialDraft;
      if (!base) return current;
      const readingDays = base.filter((day) => day.dayType === "reading");
      const balanceInput: BalanceDay[] = readingDays.map((day) => ({
        value: Number(day.amount) || 0,
        locked: day.locked,
      }));
      const balanced = chapterBased
        ? balanceChapterTargets(balanceInput, bookTotal)
        : balancePageTargets(balanceInput, bookTotal);
      const balancedByDate = new Map(
        readingDays.map((day, index) => [day.date, balanced[index]])
      );
      return base.map((day) =>
        day.dayType === "reading"
          ? { ...day, amount: String(balancedByDate.get(day.date) ?? day.amount) }
          : day
      );
    });
  };

  const handleSave = async () => {
    if (!draft) return;
    setError(null);

    for (const day of draft) {
      if (day.dayType !== "reading" || day.amount.trim() === "") continue;
      const value = Number(day.amount);
      if (!Number.isInteger(value) || value < 1) {
        setError(
          `Invalid ${chapterBased ? "chapter" : "pages"} value for ${format(parseDateFromStorage(day.date), "MMM d")}. Use a whole number of 1 or more.`
        );
        return;
      }
    }

    try {
      await saveSchedule({
        communityBookId,
        entries: draft.map((day) => {
          const isReading = day.dayType === "reading";
          const value =
            isReading && day.amount.trim() !== ""
              ? Number(day.amount)
              : undefined;
          return {
            date: day.date,
            dayType: day.dayType,
            chapterNumber: isReading && chapterBased ? value : undefined,
            plannedPages: isReading && !chapterBased ? value : undefined,
            notes: day.notes.trim() || undefined,
          };
        }),
      });
      toast({
        title: "Schedule saved",
        description:
          "Members tracking this book now follow the updated schedule. Days they already logged are untouched.",
      });
      router.push(`/communities/${slug}/books/${communityBookId}`);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Unable to save the schedule."
      );
    }
  };

  return (
    <CommunityThemeProvider brandColor={community?.brandColor}>
      <Navigation />
      <main className="mx-auto max-w-4xl p-3 sm:p-6">
        <Button variant="ghost" asChild className="mb-4">
          <Link href={`/communities/${slug}/books/${communityBookId}`}>
            <ArrowLeft className="h-4 w-4" />
            Book
          </Link>
        </Button>

        {bookPending ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !book ? (
          <Card className="p-6 text-center text-muted-foreground sm:p-10">
            This book could not be opened. It may have been removed.
          </Card>
        ) : !isManager ? (
          <Card className="p-6 text-center sm:p-10">
            <h1 className="text-2xl font-bold text-foreground">
              Admin or moderator access required
            </h1>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              Only owners, admins, and moderators can edit the reading schedule.
            </p>
          </Card>
        ) : draft === null ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-6">
            <div>
              <h1 className="text-2xl font-bold text-foreground sm:text-4xl">
                Reading schedule
              </h1>
              <p className="mt-2 text-sm text-muted-foreground sm:text-base">
                Choose what each day of &quot;{book.name}&quot; is for. Members
                get reading targets only on reading days — rest, reflection, and
                catch-up days have nothing assigned.
              </p>
            </div>

            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground">
                Weekly pattern
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Set what each day of the week is for. Changing a day here
                updates every matching day in the schedule below — you can
                still override an individual day there.
              </p>
              <div className="mt-4 space-y-2">
                {weekdayTemplates.map((weekday) => (
                  <div
                    key={weekday.label}
                    className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <span className="w-32 shrink-0 text-sm font-medium text-foreground">
                      {weekday.label}
                    </span>
                    <Select
                      value={weekday.dayType}
                      onValueChange={(value) =>
                        applyWeekdayTemplate(
                          weekday.index,
                          value as ScheduleDayType
                        )
                      }
                      disabled={!weekday.hasDays}
                    >
                      <SelectTrigger className="h-9 w-full sm:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAY_TYPE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-5 sm:p-6">
              <h2 className="text-lg font-semibold text-foreground">
                Daily reading target
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {chapterBased
                  ? "The target chapter members should reach each reading day. Spread evenly so every reading day advances and the last one reaches the end — then fine-tune individual days below."
                  : "How many pages members read each reading day. Defaults to the average across the reading window — change it here, then fine-tune individual days below."}
              </p>
              {chapterBased ? (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <span className="w-full text-sm text-muted-foreground">
                    Reset every reading day to an even progression across all{" "}
                    {totalChapters > 0 ? `${totalChapters} ` : ""}chapters.
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={spreadChaptersEvenly}
                  >
                    Spread chapters evenly
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label
                    htmlFor="global-daily-target"
                    className="w-full text-sm font-medium text-foreground sm:w-52"
                  >
                    Pages per reading day
                  </label>
                  <Input
                    id="global-daily-target"
                    type="number"
                    min={1}
                    step={1}
                    value={globalAmount}
                    placeholder={
                      defaultGlobalAmount ? String(defaultGlobalAmount) : "0"
                    }
                    onChange={(event) => setGlobalAmount(event.target.value)}
                    className="h-9 w-full sm:w-32"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={applyGlobalAmount}
                  >
                    Apply to all reading days
                  </Button>
                </div>
              )}

              {bookTotal > 0 && (
                <div
                  className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between"
                  style={{ borderColor: "var(--border)" }}
                >
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">
                      Book total: {bookTotal}{" "}
                      {chapterBased ? "chapters" : "pages"}
                    </span>
                    {" — "}
                    {coversBook
                      ? `covers all ${bookTotal} ${chapterBased ? "chapters" : "pages"}`
                      : chapterBased
                        ? `reading days reach chapter ${assignedTotal} of ${bookTotal}`
                        : `${assignedTotal} of ${bookTotal} pages assigned`}
                  </p>
                  {showAutoAdjust && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={autoAdjustToTotal}
                    >
                      Auto-adjust to book total
                    </Button>
                  )}
                </div>
              )}
            </Card>

            <Card className="p-5 sm:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {readingCount}
                  </span>{" "}
                  of {draft.length} days are reading days.
                </p>
                {useMonthTabs && activeMonth && (
                  <Tabs
                    value={activeMonth}
                    onValueChange={(value) => setMonthKey(value)}
                  >
                    <TabsList>
                      {months.map((month) => (
                        <TabsTrigger key={month.key} value={month.key}>
                          {month.label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                  </Tabs>
                )}
              </div>

              <div className="mt-4 space-y-2">
                {visibleDays.map((day) => {
                  const isReading = day.dayType === "reading";
                  return (
                    <div
                      key={day.date}
                      className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center"
                      style={
                        isReading
                          ? {
                              backgroundColor: "var(--brand-soft)",
                              borderColor: "var(--brand-border)",
                            }
                          : { borderColor: "var(--border)" }
                      }
                    >
                      <span className="w-32 shrink-0 text-sm font-medium text-foreground">
                        {format(parseDateFromStorage(day.date), "EEE, MMM d")}
                      </span>
                      <Select
                        value={day.dayType}
                        onValueChange={(value) =>
                          changeDayType(day.date, value as ScheduleDayType)
                        }
                      >
                        <SelectTrigger className="h-9 w-full sm:w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {DAY_TYPE_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {isReading && (
                        <Input
                          type="number"
                          min={1}
                          step={1}
                          placeholder={
                            defaultAmountByDate.has(day.date)
                              ? String(defaultAmountByDate.get(day.date))
                              : unitLabel
                          }
                          value={day.amount}
                          onChange={(event) =>
                            updateDay(day.date, {
                              amount: event.target.value,
                              locked: true,
                            })
                          }
                          className="h-9 w-full sm:w-28"
                          aria-label={`${unitLabel} for ${format(
                            parseDateFromStorage(day.date),
                            "MMM d"
                          )}`}
                        />
                      )}
                      <Input
                        placeholder={
                          day.dayType === "reflection"
                            ? "e.g. What stood out this week?"
                            : "Note (optional)"
                        }
                        value={day.notes}
                        onChange={(event) =>
                          updateDay(day.date, { notes: event.target.value })
                        }
                        className="h-9 flex-1"
                      />
                    </div>
                  );
                })}
              </div>
            </Card>

            <div
              className="sticky bottom-0 z-10 -mx-3 border-t bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6"
              style={{ borderColor: "var(--border)" }}
            >
              {error && (
                <p className="mb-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" asChild>
                  <Link href={`/communities/${slug}/books/${communityBookId}`}>
                    Cancel
                  </Link>
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={savePending}
                  style={{
                    backgroundColor: "var(--brand)",
                    color: "var(--brand-foreground)",
                  }}
                >
                  {savePending ? "Saving..." : "Save Schedule"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>
    </CommunityThemeProvider>
  );
}
