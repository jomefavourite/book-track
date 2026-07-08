import { formatDateForStorage } from "./dateUtils";
import type { ChapterTrackingSessionLike } from "./chapterTracking";

export type ChapterSessionLike = ChapterTrackingSessionLike & {
  chapterNumber?: number | null;
};

/**
 * Adaptive chapter targets for chapter-only (and chapter-tracking) books.
 * All days start from the static schedule; unread days after the last read
 * day are redistributed from the highest logged chapter through end of schedule.
 */
export function computeChapterSuggestions(
  readingPeriodDays: Date[],
  getSessionForDate: (dateKey: string) => ChapterSessionLike | undefined,
  chapterDropdownMax: number | null,
  chapterDistribution: Map<string, number>,
  chapterOnlyMode: boolean
): Map<string, number> {
  const suggestions = new Map<string, number>();

  if (chapterOnlyMode && chapterDropdownMax !== null) {
    let lastKnownChapter = 0;
    let lastReadIndex = -1;

    readingPeriodDays.forEach((day, index) => {
      const dateKey = formatDateForStorage(day);
      const session = getSessionForDate(dateKey);
      if (
        session?.isRead &&
        !session?.isMissed &&
        session.chapterNumber != null &&
        session.chapterNumber >= 1
      ) {
        lastKnownChapter = Math.max(lastKnownChapter, session.chapterNumber);
        lastReadIndex = index;
      }
    });

    const remainingDays = readingPeriodDays.filter((day, index) => {
      if (index <= lastReadIndex) return false;
      const dateKey = formatDateForStorage(day);
      const session = getSessionForDate(dateKey);
      return !session?.isMissed;
    });

    const remainingChapters = chapterDropdownMax - lastKnownChapter;
    const remainingDayCount = remainingDays.length;

    readingPeriodDays.forEach((day) => {
      const dateKey = formatDateForStorage(day);
      suggestions.set(dateKey, chapterDistribution.get(dateKey) ?? 1);
    });

    remainingDays.forEach((day, index) => {
      const dateKey = formatDateForStorage(day);
      const target =
        remainingDayCount > 0
          ? Math.min(
              chapterDropdownMax,
              lastKnownChapter +
                Math.ceil(((index + 1) * remainingChapters) / remainingDayCount)
            )
          : chapterDropdownMax;
      suggestions.set(dateKey, Math.max(1, target));
    });

    return suggestions;
  }

  let lastKnownChapter = 1;
  readingPeriodDays.forEach((day) => {
    const dateKey = formatDateForStorage(day);
    const sessionChapter = getSessionForDate(dateKey)?.chapterNumber;
    if (
      sessionChapter !== undefined &&
      sessionChapter !== null &&
      sessionChapter >= 1
    ) {
      lastKnownChapter = sessionChapter;
    }

    if (chapterDropdownMax !== null) {
      lastKnownChapter = Math.min(lastKnownChapter, chapterDropdownMax);
    }

    suggestions.set(dateKey, Math.max(1, lastKnownChapter));
  });

  return suggestions;
}

/** Original static schedule target for a day. */
export function getStaticTargetChapterForDate(
  dateKey: string,
  chapterDistribution: Map<string, number>
): number {
  return chapterDistribution.get(dateKey) ?? 1;
}

/** Target chapter from suggestions/adaptive schedule (unread days). */
export function getTargetChapterForDate(
  dateKey: string,
  chapterSuggestions: Map<string, number>,
  chapterDistribution: Map<string, number>
): number {
  return chapterSuggestions.get(dateKey) ?? chapterDistribution.get(dateKey) ?? 1;
}

/**
 * Target shown in UI:
 * - unread: adaptive catch-up/ahead suggestion
 * - read: frozen targetChapter from mark time, else original static schedule
 */
export function getDisplayTargetChapterForDate(
  dateKey: string,
  session: ChapterSessionLike | undefined,
  chapterSuggestions: Map<string, number>,
  chapterDistribution: Map<string, number>
): number {
  if (session?.isRead && !session?.isMissed) {
    if (
      session.targetChapter !== undefined &&
      session.targetChapter !== null &&
      session.targetChapter >= 1
    ) {
      return session.targetChapter;
    }
    return getStaticTargetChapterForDate(dateKey, chapterDistribution);
  }
  return getTargetChapterForDate(dateKey, chapterSuggestions, chapterDistribution);
}

/** Chapter shown for a read day — logged value, falling back to the schedule target. */
export function getReadChapterForDate(
  dateKey: string,
  session: ChapterSessionLike | undefined,
  chapterSuggestions: Map<string, number>,
  chapterDistribution: Map<string, number>,
  normalize: (value: number) => number
): number {
  if (
    session?.chapterNumber !== undefined &&
    session.chapterNumber !== null &&
    session.chapterNumber >= 1
  ) {
    return normalize(session.chapterNumber);
  }
  return normalize(
    getTargetChapterForDate(dateKey, chapterSuggestions, chapterDistribution)
  );
}
