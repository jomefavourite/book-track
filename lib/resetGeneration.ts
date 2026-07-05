/**
 * Helpers for filtering reading sessions to a book's current reading cycle.
 *
 * A book can be "reset" to start over from scratch. Reset bumps the book's
 * `resetGeneration`; sessions stamped with an older generation are "stale"
 * (preserved but frozen). Absent generation on either side is treated as 0, so
 * data created before this feature needs no migration.
 *
 * Mirrors `activeSessions` in `convex/bookProgress.ts` for use on the client.
 */

type BookGeneration = { resetGeneration?: number };
type SessionGeneration = { resetGeneration?: number };

export function isActiveSession(
  session: SessionGeneration,
  book: BookGeneration
): boolean {
  return (session.resetGeneration ?? 0) === (book.resetGeneration ?? 0);
}

export function isStaleSession(
  session: SessionGeneration,
  book: BookGeneration
): boolean {
  return (session.resetGeneration ?? 0) < (book.resetGeneration ?? 0);
}

export function filterActiveSessions<T extends SessionGeneration>(
  sessions: T[],
  book: BookGeneration
): T[] {
  return sessions.filter((session) => isActiveSession(session, book));
}

export function filterStaleSessions<T extends SessionGeneration>(
  sessions: T[],
  book: BookGeneration
): T[] {
  return sessions.filter((session) => isStaleSession(session, book));
}
