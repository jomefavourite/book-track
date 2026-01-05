"use client";

import { useMemo } from "react";
import { format, addDays, parseISO } from "date-fns";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { convexQuery, useConvexMutation } from "@convex-dev/react-query";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useUser } from "@clerk/nextjs";
import { formatDateForStorage, parseDateFromStorage } from "@/lib/dateUtils";
import { calculateDailyPages } from "@/lib/readingCalculator";
import CatchUpSuggestion from "./CatchUpSuggestion";

interface DaysViewProps {
  bookId: Id<"books">;
  book: {
    startDate: string;
    endDate: string;
    totalPages: number;
    daysToRead?: number;
  };
  canEdit?: boolean;
}

export default function DaysView({ bookId, book, canEdit = true }: DaysViewProps) {
  const { user, isLoaded } = useUser();
  const queryClient = useQueryClient();
  const { data: sessionsQuery, isPending } = useQuery({
    ...convexQuery(api.readingSessions.getSessionsForBook, { 
      bookId, 
      userId: user?.id 
    }),
    enabled: true, // Allow querying even without auth (for public books)
  });
  const { mutateAsync: updateSession } = useMutation({
    mutationFn: useConvexMutation(api.readingSessions.updateSession),
    onSuccess: () => {
      // Invalidate and refetch the sessions query for this book
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.readingSessions.getSessionsForBook, {
          bookId,
        }).queryKey,
      });
      // Also invalidate the books list to update progress
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, {}).queryKey,
      });
    },
  });
  const { mutateAsync: createSession } = useMutation({
    mutationFn: useConvexMutation(api.readingSessions.createSession),
    onSuccess: () => {
      // Invalidate and refetch the sessions query for this book
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.readingSessions.getSessionsForBook, {
          bookId,
        }).queryKey,
      });
      // Also invalidate the books list to update progress
      queryClient.invalidateQueries({
        queryKey: convexQuery(api.books.getBooks, {}).queryKey,
      });
    },
  });

  // Use empty array as default to ensure hooks are always called
  const sessions = sessionsQuery || [];

  const startDate = parseDateFromStorage(book.startDate);
  const endDate = parseDateFromStorage(book.endDate);
  const totalDays =
    book.daysToRead ||
    Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;
  const pagesPerDay = useMemo(
    () => calculateDailyPages(book.totalPages, totalDays),
    [book.totalPages, totalDays]
  );

  const sessionsMap = useMemo(() => {
    const map = new Map<string, (typeof sessions)[0]>();
    sessions.forEach((session) => {
      map.set(session.date, session);
    });
    return map;
  }, [sessions]);

  const days = useMemo(() => {
    return Array.from({ length: totalDays }, (_, i) => {
      const date = addDays(startDate, i);
      return {
        dayNumber: i + 1,
        date,
        dateKey: formatDateForStorage(date),
      };
    });
  }, [startDate, totalDays]);

  const handleDayToggle = async (dateKey: string) => {
    if (!canEdit || !user?.id) return;
    const existingSession = sessionsMap.get(dateKey);

    if (existingSession) {
      await updateSession({
        sessionId: existingSession._id,
        userId: user.id,
        isRead: !existingSession.isRead,
        actualPages: existingSession.actualPages,
      });
    } else {
      await createSession({
        bookId,
        userId: user.id,
        date: dateKey,
        plannedPages: pagesPerDay,
        isRead: true,
      });
    }
  };

  const handlePagesUpdate = async (dateKey: string, pages: number) => {
    if (!canEdit || !user?.id) return;
    const existingSession = sessionsMap.get(dateKey);

    if (existingSession) {
      await updateSession({
        sessionId: existingSession._id,
        userId: user.id,
        isRead: existingSession.isRead,
        actualPages: pages,
      });
    }
  };

  const totalPagesRead = useMemo(() => {
    return sessions.reduce((sum, session) => {
      return (
        sum +
        (session.actualPages || (session.isRead ? session.plannedPages : 0))
      );
    }, 0);
  }, [sessions]);

  const progress = (totalPagesRead / book.totalPages) * 100;

  if (isPending && sessionsQuery === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="text-muted-foreground">
          Loading reading sessions...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CatchUpSuggestion
        bookId={bookId}
        book={book}
        sessions={sessions}
      />

      <div className="rounded-lg border border-border bg-card p-4">
        <div className="mb-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-foreground">
              Progress
            </span>
            <span className="text-sm text-muted-foreground">
              {totalPagesRead} / {book.totalPages} pages ({Math.round(progress)}
              %)
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {days.map(({ dayNumber, date, dateKey }) => {
            const session = sessionsMap.get(dateKey);
            const isRead = session?.isRead || false;

            return (
              <div
                key={dateKey}
                className={`rounded border p-3 ${
                  isRead
                    ? "border-green-600 bg-green-100 text-green-900 dark:border-green-600 dark:bg-green-950 dark:text-green-50"
                    : "border-border bg-background"
                }`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-sm font-medium">Day {dayNumber}</div>
                    <div className="text-xs text-muted-foreground">
                      {format(date, "MMM d, yyyy")}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDayToggle(dateKey)}
                    disabled={!canEdit}
                    className={`flex h-5 w-5 items-center justify-center rounded border-2 border-input transition-all sm:h-6 sm:w-6 ${
                      canEdit
                        ? "active:scale-90 cursor-pointer hover:border-primary"
                        : "cursor-not-allowed opacity-50"
                    }`}
                    aria-label={isRead ? "Mark as unread" : "Mark as read"}
                  >
                    {isRead && (
                      <svg
                        className="h-3 w-3 text-green-700 dark:text-green-400 sm:h-4 sm:w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    )}
                  </button>
                </div>
                <div className="mb-2 text-xs text-muted-foreground">
                  Plan: {pagesPerDay} pages
                </div>
                {isRead && (
                  <div>
                    <label className="block text-xs font-medium text-foreground">
                      Actual Pages
                    </label>
                    <input
                      type="number"
                      value={session?.actualPages || pagesPerDay}
                      onChange={(e) =>
                        handlePagesUpdate(dateKey, Number(e.target.value))
                      }
                      disabled={!canEdit}
                      min="0"
                      className={`mt-1 w-full rounded border border-input bg-background px-1.5 py-1 text-xs ${
                        canEdit
                          ? "focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:focus:border-blue-400"
                          : "cursor-not-allowed opacity-50"
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
