"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { format, parse } from "date-fns";
import { Flame, Trophy } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  buildHeatmap,
  getActivityYears,
  getStreaks,
  type DayActivity,
  type HeatmapCell,
  type HeatmapLevel,
  type HeatmapRange,
} from "@/lib/readingActivity";

const LEVEL_CLASSES: Record<HeatmapLevel, string> = {
  0: "bg-muted dark:bg-white/[0.06]",
  1: "bg-emerald-200 dark:bg-emerald-900",
  2: "bg-emerald-400 dark:bg-emerald-700",
  3: "bg-emerald-500 dark:bg-emerald-500",
  4: "bg-emerald-700 dark:bg-emerald-300",
};

// Squares grow to fill wide cards (like GitHub) but never shrink below
// MIN_CELL; narrower screens scroll horizontally instead.
const MIN_CELL = 11;
const MAX_CELL = 16;
const GAP = 3;
const WEEKDAY_COLUMN = 32; // weekday label column incl. its right margin

const WEEKDAY_LABELS = ["", "Mon", "", "Wed", "", "Fri", ""];

const MAX_TITLES = 5;
const TOOLTIP_HALF_WIDTH = 128; // half of the tooltip's max width + margin

function formatDay(date: string) {
  return format(parse(date, "yyyy-MM-dd", new Date()), "EEE, MMM d, yyyy");
}

function summarizeDay(cell: HeatmapCell) {
  if (cell.books === 0) return "No reading logged";
  const books = plural(cell.books, "book", "books");
  return cell.pages > 0
    ? `${books} · ${plural(cell.pages, "page", "pages")}`
    : books;
}

type Tooltip = {
  cell: HeatmapCell;
  x: number;
  y: number;
  placement: "above" | "below";
};

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

export default function ReadingHeatmap({
  activity,
  isOwnProfile,
}: {
  activity: DayActivity[] | undefined;
  isOwnProfile: boolean;
}) {
  const [range, setRange] = useState<HeatmapRange>("last-year");
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(0);

  const data = useMemo(() => activity ?? [], [activity]);
  const heatmap = useMemo(() => buildHeatmap(data, range), [data, range]);
  const streaks = useMemo(() => getStreaks(data), [data]);
  const years = useMemo(() => getActivityYears(data), [data]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) =>
      setAvailableWidth(entry.contentRect.width)
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const weekCount = heatmap.weeks.length;
  const cellSize = availableWidth
    ? Math.max(
        MIN_CELL,
        Math.min(
          MAX_CELL,
          Math.floor((availableWidth - WEEKDAY_COLUMN) / weekCount - GAP)
        )
      )
    : MIN_CELL;
  const cellStyle = { width: cellSize, height: cellSize };

  // Narrow screens scroll the grid; start at the most recent weeks.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [heatmap, cellSize]);

  // The tooltip is fixed-positioned, so drop it when anything scrolls or when
  // the reader taps elsewhere (touch has no mouseleave).
  useEffect(() => {
    if (!tooltip) return;
    const close = () => setTooltip(null);
    const closeOnOutsideTap = (event: PointerEvent) => {
      if (!(event.target as Element | null)?.closest?.("[data-heatmap-cell]")) {
        close();
      }
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    document.addEventListener("pointerdown", closeOnOutsideTap);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      document.removeEventListener("pointerdown", closeOnOutsideTap);
    };
  }, [tooltip]);

  const showTooltip = (cell: HeatmapCell, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const placement = rect.top < 160 ? "below" : "above";
    setTooltip({
      cell,
      x: Math.min(
        Math.max(rect.left + rect.width / 2, TOOLTIP_HALF_WIDTH),
        window.innerWidth - TOOLTIP_HALF_WIDTH
      ),
      y: placement === "above" ? rect.top - 8 : rect.bottom + 8,
      placement,
    });
  };

  const rangeLabel = range === "last-year" ? "in the last year" : `in ${range}`;
  const rangeOptions: { value: HeatmapRange; label: string }[] = [
    { value: "last-year", label: "Last year" },
    ...years.map((year) => ({ value: year as HeatmapRange, label: String(year) })),
  ];

  return (
    <section aria-labelledby="reading-activity-heading">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2
            id="reading-activity-heading"
            className="text-lg font-semibold text-foreground"
          >
            Reading activity
          </h2>
          {activity === undefined ? (
            <div className="mt-1 h-4 w-48 animate-pulse rounded bg-muted" />
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {plural(heatmap.readingDays, "reading day", "reading days")}{" "}
              {rangeLabel}
              {heatmap.pages > 0 &&
                ` · ${plural(heatmap.pages, "page", "pages")}`}
            </p>
          )}
        </div>

        {rangeOptions.length > 1 && (
          <div
            role="radiogroup"
            aria-label="Activity period"
            className="-mx-1 flex max-w-full gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {rangeOptions.map((option) => {
              const active = option.value === range;
              return (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => {
                    setRange(option.value);
                    setTooltip(null);
                  }}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "bg-foreground text-background"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Card className="overflow-hidden p-4 sm:p-5">
        <div
          ref={scrollRef}
          className="overflow-x-auto pb-1 [scrollbar-width:thin]"
        >
          <div
            className="inline-flex min-w-full justify-center"
            role="img"
            aria-label={`Reading activity heatmap: ${plural(
              heatmap.readingDays,
              "reading day",
              "reading days"
            )} ${rangeLabel}`}
          >
            {/* Weekday labels */}
            <div
              className="sticky left-0 z-10 flex shrink-0 flex-col bg-card text-[10px] leading-none text-muted-foreground"
              style={{ gap: GAP, paddingTop: 16 + GAP, width: WEEKDAY_COLUMN }}
              aria-hidden="true"
            >
              {WEEKDAY_LABELS.map((label, index) => (
                <span
                  key={index}
                  className="flex items-center"
                  style={{ height: cellSize }}
                >
                  {label}
                </span>
              ))}
            </div>

            <div aria-hidden="true">
              {/* Month labels */}
              <div className="relative h-4" style={{ marginBottom: GAP }}>
                {heatmap.monthLabels.map((month) => (
                  <span
                    key={`${month.weekIndex}-${month.label}`}
                    className="absolute top-0 whitespace-nowrap text-[10px] leading-none text-muted-foreground"
                    style={{ left: month.weekIndex * (cellSize + GAP) }}
                  >
                    {month.label}
                  </span>
                ))}
              </div>

              {/* Weeks */}
              <div className="flex" style={{ gap: GAP }}>
                {heatmap.weeks.map((week, weekIndex) => (
                  <div
                    key={weekIndex}
                    className="flex flex-col"
                    style={{ gap: GAP }}
                  >
                    {week.map((cell) =>
                      cell.inRange ? (
                        <div
                          key={cell.date}
                          data-heatmap-cell=""
                          style={cellStyle}
                          onMouseEnter={(event) =>
                            showTooltip(cell, event.currentTarget)
                          }
                          onMouseLeave={() => setTooltip(null)}
                          onClick={(event) =>
                            showTooltip(cell, event.currentTarget)
                          }
                          className={cn(
                            "cursor-pointer rounded-[3px] outline outline-1 -outline-offset-1 outline-black/[0.04] transition-transform hover:scale-125 dark:outline-white/[0.04]",
                            LEVEL_CLASSES[cell.level],
                            tooltip?.cell.date === cell.date &&
                              "ring-1 ring-foreground ring-offset-1 ring-offset-card"
                          )}
                        />
                      ) : (
                        <div key={cell.date} style={cellStyle} />
                      )
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <p>
            <span className="sm:hidden">Tap a day to see what you read</span>
            <span className="hidden sm:inline">
              Hover a day to see what was read
            </span>
          </p>
          <div className="flex items-center gap-1.5" aria-hidden="true">
            <span>Less</span>
            {([0, 1, 2, 3, 4] as HeatmapLevel[]).map((level) => (
              <span
                key={level}
                className={cn("size-[11px] rounded-[3px]", LEVEL_CLASSES[level])}
              />
            ))}
            <span>More</span>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-orange-500/10">
              <Flame className="h-[18px] w-[18px] text-orange-600 dark:text-orange-400" />
            </span>
            <div>
              <p className="text-lg font-bold leading-tight tabular-nums text-foreground">
                {plural(streaks.current, "day", "days")}
              </p>
              <p className="text-xs text-muted-foreground">Current streak</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/10">
              <Trophy className="h-[18px] w-[18px] text-amber-600 dark:text-amber-400" />
            </span>
            <div>
              <p className="text-lg font-bold leading-tight tabular-nums text-foreground">
                {plural(streaks.longest, "day", "days")}
              </p>
              <p className="text-xs text-muted-foreground">Longest streak</p>
            </div>
          </div>
        </div>

        {isOwnProfile && (
          <p className="mt-3 text-xs text-muted-foreground">
            Includes your private books. Visitors only see the titles of your
            public books; private ones show as a count.
          </p>
        )}
      </Card>

      {tooltip && (
        <div
          role="tooltip"
          className="pointer-events-none fixed z-50 w-max max-w-60 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform:
              tooltip.placement === "above"
                ? "translate(-50%, -100%)"
                : "translate(-50%, 0)",
          }}
        >
          <p className="font-semibold">{summarizeDay(tooltip.cell)}</p>
          <p className="text-muted-foreground">{formatDay(tooltip.cell.date)}</p>
          {(tooltip.cell.titles.length > 0 ||
            tooltip.cell.privateBooks > 0) && (
            <ul className="mt-1.5 space-y-0.5 border-t border-border pt-1.5">
              {tooltip.cell.titles.slice(0, MAX_TITLES).map((title, index) => (
                <li key={`${title}-${index}`} className="flex gap-1.5">
                  <span
                    className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500"
                    aria-hidden="true"
                  />
                  <span className="line-clamp-2">{title}</span>
                </li>
              ))}
              {tooltip.cell.titles.length > MAX_TITLES && (
                <li className="text-muted-foreground">
                  +{tooltip.cell.titles.length - MAX_TITLES} more
                </li>
              )}
              {tooltip.cell.privateBooks > 0 && (
                <li className="text-muted-foreground">
                  {plural(
                    tooltip.cell.privateBooks,
                    "private book",
                    "private books"
                  )}
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
