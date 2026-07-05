import { Doc } from "./_generated/dataModel";

/**
 * Sessions belonging to the book's current reading cycle. Sessions from an earlier
 * cycle (reset) are "stale" and excluded from all progress calculations. Absent
 * generation on either side is treated as 0, so pre-reset data needs no migration.
 */
export function activeSessions(
  book: Pick<Doc<"books">, "resetGeneration">,
  sessions: Doc<"readingSessions">[]
): Doc<"readingSessions">[] {
  const gen = book.resetGeneration ?? 0;
  return sessions.filter((session) => (session.resetGeneration ?? 0) === gen);
}

function isChapterOnlyBook(
  book: Pick<Doc<"books">, "progressStyle" | "ignorePages">
) {
  return book.progressStyle === "chapters" && book.ignorePages === true;
}

function getHighestChapterRead(
  book: Pick<Doc<"books">, "totalChapters">,
  sessions: Doc<"readingSessions">[]
): number {
  const highestChapter = sessions.reduce((highest, session) => {
    if (!session.isRead || session.isMissed || session.chapterNumber == null) {
      return highest;
    }
    return Math.max(highest, session.chapterNumber);
  }, 0);

  if (typeof book.totalChapters === "number") {
    return Math.min(highestChapter, book.totalChapters);
  }

  return highestChapter;
}

export function pagesReadFromSessions(
  sessions: Doc<"readingSessions">[]
): number {
  return sessions.reduce((sum, session) => {
    if (session.isRead && !session.isMissed) {
      return sum + (session.actualPages ?? session.plannedPages ?? 0);
    }
    return sum;
  }, 0);
}

export function getBookProgressPercent(
  book: Doc<"books">,
  sessions: Doc<"readingSessions">[]
): number {
  if (book.markedCompleteAt != null) {
    return 100;
  }
  const active = activeSessions(book, sessions);
  if (isChapterOnlyBook(book)) {
    if (!book.totalChapters || book.totalChapters <= 0) {
      return 0;
    }
    return (getHighestChapterRead(book, active) / book.totalChapters) * 100;
  }
  if ((book.totalPages ?? 0) <= 0) {
    return 0;
  }
  return (pagesReadFromSessions(active) / (book.totalPages ?? 0)) * 100;
}

/** Pages read for aggregate stats (community totals); full book when manually completed */
export function getEffectivePagesReadForStats(
  book: Doc<"books">,
  sessions: Doc<"readingSessions">[]
): number {
  if (isChapterOnlyBook(book)) {
    return 0;
  }
  if (book.markedCompleteAt != null) {
    return book.totalPages ?? 0;
  }
  return pagesReadFromSessions(activeSessions(book, sessions));
}
