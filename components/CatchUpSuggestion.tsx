"use client";

import { useMemo } from "react";
import { Id } from "@/convex/_generated/dataModel";
import {
  computeCatchUpSuggestion,
  type CatchUpBookInput,
  type CatchUpSchedule,
  type CatchUpSessionInput,
} from "@/lib/catchUpPlanning";

interface CatchUpSuggestionProps {
  bookId: Id<"books">;
  book: CatchUpBookInput;
  sessions: CatchUpSessionInput[];
  /** Community books only; omitted for personal books. */
  schedule?: CatchUpSchedule;
}

export default function CatchUpSuggestion({
  book,
  sessions,
  schedule,
}: CatchUpSuggestionProps) {
  const suggestion = useMemo(
    () => computeCatchUpSuggestion(book, sessions, schedule),
    [book, sessions, schedule]
  );

  if (!suggestion) {
    return null;
  }

  return (
    <div
      className={`rounded-lg border p-4 ${
        suggestion.type === "overdue"
          ? "border-red-500 bg-red-100 text-red-900 dark:border-red-600 dark:bg-red-950 dark:text-red-50"
          : "border-amber-500 bg-amber-100 text-amber-900 dark:border-yellow-600 dark:bg-yellow-950 dark:text-yellow-50"
      }`}
    >
      <h3 className="mb-2 font-semibold">
        {suggestion.type === "overdue"
          ? "⚠️ Reading Period Ended"
          : "📚 Catch-Up Suggestion"}
      </h3>
      <p className="text-sm">{suggestion.message}</p>
      {suggestion.type === "catchup" &&
        "remainingPages" in suggestion && (
          <div className="mt-2 text-sm">
            <p>
              Remaining: {suggestion.remainingPages} pages over{" "}
              {suggestion.remainingDays} days
            </p>
          </div>
        )}
      {suggestion.type === "catchup" &&
        "remainingChapters" in suggestion && (
          <div className="mt-2 text-sm">
            <p>
              Remaining: {suggestion.remainingChapters} chapter
              {suggestion.remainingChapters === 1 ? "" : "s"} over{" "}
              {suggestion.remainingDays} days
            </p>
          </div>
        )}
    </div>
  );
}
