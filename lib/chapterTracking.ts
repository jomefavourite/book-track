export interface ChapterTrackingBookLike {
  progressStyle?: "pages" | "chapters";
  ignorePages?: boolean;
  totalChapters?: number;
}

export interface ChapterTrackingSessionLike {
  isRead: boolean;
  isMissed?: boolean;
  chapterNumber?: number | null;
  /** Adaptive target frozen at mark time (chapter-only books) */
  targetChapter?: number | null;
}

export function isChapterOnlyBook(book: ChapterTrackingBookLike): boolean {
  return book.progressStyle === "chapters" && book.ignorePages === true;
}

export function clampChapterNumber(
  chapterNumber: number,
  totalChapters?: number
): number {
  const normalized = Math.max(1, Math.floor(chapterNumber));
  if (
    typeof totalChapters === "number" &&
    Number.isInteger(totalChapters) &&
    totalChapters > 0
  ) {
    return Math.min(normalized, totalChapters);
  }
  return normalized;
}

export function getHighestChapterRead(
  sessions: ChapterTrackingSessionLike[],
  totalChapters?: number
): number {
  const highestChapter = sessions.reduce((highest, session) => {
    if (!session.isRead || session.isMissed || session.chapterNumber == null) {
      return highest;
    }
    return Math.max(highest, session.chapterNumber);
  }, 0);

  if (
    typeof totalChapters === "number" &&
    Number.isInteger(totalChapters) &&
    totalChapters > 0
  ) {
    return Math.min(highestChapter, totalChapters);
  }

  return highestChapter;
}
