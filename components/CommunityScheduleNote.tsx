import { Info } from "lucide-react";

import { cn } from "@/lib/utils";

interface CommunityScheduleNoteIndicatorProps {
  dateKey: string;
  dateLabel: string;
  note: string;
}

export function CommunityScheduleNoteIndicator({
  dateKey,
  dateLabel,
  note,
}: CommunityScheduleNoteIndicatorProps) {
  const tooltipId = `community-note-${dateKey}`;

  return (
    <span className="group relative z-20 hidden sm:inline-flex">
      <button
        type="button"
        aria-label={`Community note for ${dateLabel}`}
        aria-describedby={tooltipId}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex h-5 w-5 items-center justify-center rounded-full text-current opacity-70 transition hover:bg-muted hover:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
      <span
        id={tooltipId}
        role="tooltip"
        className="pointer-events-none invisible absolute left-0 top-full z-50 mt-2 w-56 rounded-md border border-border bg-popover p-3 text-left text-xs font-normal leading-relaxed text-popover-foreground opacity-0 shadow-lg transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
      >
        <span className="mb-1 block font-semibold">Community note</span>
        <span className="whitespace-pre-wrap">{note}</span>
      </span>
    </span>
  );
}

interface CommunityScheduleNoteCalloutProps {
  note: string;
  className?: string;
}

export function CommunityScheduleNoteCallout({
  note,
  className,
}: CommunityScheduleNoteCalloutProps) {
  return (
    <div
      className={cn(
        "rounded-lg border border-primary/20 bg-primary/5 p-4 dark:border-primary/30",
        className
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
        <Info className="h-4 w-4 shrink-0 text-primary" />
        Community note
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
