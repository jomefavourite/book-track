import { Doc } from "./_generated/dataModel";

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
  if (book.totalPages <= 0) {
    return 0;
  }
  return (pagesReadFromSessions(sessions) / book.totalPages) * 100;
}

/** Pages read for aggregate stats (community totals); full book when manually completed */
export function getEffectivePagesReadForStats(
  book: Doc<"books">,
  sessions: Doc<"readingSessions">[]
): number {
  if (book.markedCompleteAt != null) {
    return book.totalPages;
  }
  return pagesReadFromSessions(sessions);
}
