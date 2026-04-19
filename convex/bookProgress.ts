import { Doc } from "./_generated/dataModel";

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
  if (isChapterOnlyBook(book)) {
    if (!book.totalChapters || book.totalChapters <= 0) {
      return 0;
    }
    return (getHighestChapterRead(book, sessions) / book.totalChapters) * 100;
  }
  if ((book.totalPages ?? 0) <= 0) {
    return 0;
  }
  return (pagesReadFromSessions(sessions) / (book.totalPages ?? 0)) * 100;
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
  return pagesReadFromSessions(sessions);
}
