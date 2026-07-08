import { describe, it, expect } from "vitest";
import { formatDateForStorage, getAllDaysInRange } from "./dateUtils";
import { distributeChaptersAcrossDays } from "./readingCalculator";
import {
  computeChapterSuggestions,
  getDisplayTargetChapterForDate,
  getStaticTargetChapterForDate,
  getTargetChapterForDate,
} from "./chapterPlanning";
import type { ChapterSessionLike } from "./chapterPlanning";

describe("computeChapterSuggestions (chapter-only mode)", () => {
  const startDate = new Date(2026, 0, 1);
  const endDate = new Date(2026, 0, 30);
  const readingPeriodDays = getAllDaysInRange(startDate, endDate);
  const chapterDropdownMax = 150;
  const chapterDistribution = distributeChaptersAcrossDays(
    chapterDropdownMax,
    startDate,
    endDate
  );

  function dateKeyAt(dayIndex: number): string {
    return formatDateForStorage(readingPeriodDays[dayIndex]!);
  }

  it("keeps static suggestions for read days even when logged chapter differs", () => {
    const sessions = new Map<string, ChapterSessionLike>();
    for (let i = 0; i < 5; i++) {
      const key = dateKeyAt(i);
      sessions.set(key, {
        isRead: true,
        isMissed: false,
        chapterNumber: (i + 1) * 5,
      });
    }
    const day6Key = dateKeyAt(5);
    sessions.set(day6Key, {
      isRead: true,
      isMissed: false,
      chapterNumber: 31,
    });

    const suggestions = computeChapterSuggestions(
      readingPeriodDays,
      (dateKey) => sessions.get(dateKey),
      chapterDropdownMax,
      chapterDistribution,
      true
    );

    for (let i = 0; i < 6; i++) {
      const key = dateKeyAt(i);
      expect(suggestions.get(key)).toBe(chapterDistribution.get(key));
    }
    expect(suggestions.get(day6Key)).toBe(30);
    expect(suggestions.get(day6Key)).not.toBe(31);
  });

  it("redistributes unread days after last read from highest logged chapter", () => {
    const sessions = new Map<string, ChapterSessionLike>();
    for (let i = 0; i < 6; i++) {
      const key = dateKeyAt(i);
      sessions.set(key, {
        isRead: true,
        isMissed: false,
        chapterNumber: i < 5 ? (i + 1) * 5 : 31,
      });
    }

    const suggestions = computeChapterSuggestions(
      readingPeriodDays,
      (dateKey) => sessions.get(dateKey),
      chapterDropdownMax,
      chapterDistribution,
      true
    );

    const day7Key = dateKeyAt(6);
    const staticDay7 = chapterDistribution.get(day7Key)!;
    const adaptiveDay7 = suggestions.get(day7Key)!;

    expect(staticDay7).toBe(35);
    expect(adaptiveDay7).toBeGreaterThan(31);
    expect(adaptiveDay7).not.toBe(staticDay7);
  });
});

describe("getDisplayTargetChapterForDate", () => {
  const startDate = new Date(2026, 0, 1);
  const endDate = new Date(2026, 0, 30);
  const readingPeriodDays = getAllDaysInRange(startDate, endDate);
  const chapterDistribution = distributeChaptersAcrossDays(150, startDate, endDate);
  const chapterSuggestions = new Map<string, number>();
  readingPeriodDays.forEach((day, index) => {
    const key = formatDateForStorage(day);
    chapterSuggestions.set(key, index === 6 ? 36 : chapterDistribution.get(key)!);
  });

  it("returns static schedule target for read sessions", () => {
    const dateKey = formatDateForStorage(readingPeriodDays[5]!);
    const session: ChapterSessionLike = {
      isRead: true,
      isMissed: false,
      chapterNumber: 31,
    };

    expect(
      getDisplayTargetChapterForDate(
        dateKey,
        session,
        chapterSuggestions,
        chapterDistribution
      )
    ).toBe(getStaticTargetChapterForDate(dateKey, chapterDistribution));
    expect(
      getDisplayTargetChapterForDate(
        dateKey,
        session,
        chapterSuggestions,
        chapterDistribution
      )
    ).toBe(30);
  });

  it("returns adaptive target for unread days", () => {
    const dateKey = formatDateForStorage(readingPeriodDays[6]!);
    expect(
      getDisplayTargetChapterForDate(
        dateKey,
        undefined,
        chapterSuggestions,
        chapterDistribution
      )
    ).toBe(getTargetChapterForDate(dateKey, chapterSuggestions, chapterDistribution));
    expect(
      getDisplayTargetChapterForDate(
        dateKey,
        undefined,
        chapterSuggestions,
        chapterDistribution
      )
    ).toBe(36);
    expect(getStaticTargetChapterForDate(dateKey, chapterDistribution)).toBe(35);
  });

  it("keeps frozen adaptive target after marking (does not fall back to static)", () => {
    const start = new Date(2026, 6, 5);
    const end = new Date(2026, 6, 8);
    const days = getAllDaysInRange(start, end);
    const totalChapters = 20;
    const distribution = distributeChaptersAcrossDays(totalChapters, start, end);

    const sessions = new Map<string, ChapterSessionLike>();
    sessions.set(formatDateForStorage(days[0]!), {
      isRead: true,
      isMissed: false,
      chapterNumber: 5,
    });
    sessions.set(formatDateForStorage(days[1]!), {
      isRead: true,
      isMissed: false,
      chapterNumber: 8,
    });

    const suggestions = computeChapterSuggestions(
      days,
      (dateKey) => sessions.get(dateKey),
      totalChapters,
      distribution,
      true
    );

    const day3Key = formatDateForStorage(days[2]!);
    expect(suggestions.get(day3Key)).toBe(14);
    expect(getStaticTargetChapterForDate(day3Key, distribution)).toBe(15);

    // Unread: adaptive catch-up target
    expect(
      getDisplayTargetChapterForDate(day3Key, undefined, suggestions, distribution)
    ).toBe(14);

    // After mark with frozen targetChapter: stays 14 (not static 15)
    const readSession: ChapterSessionLike = {
      isRead: true,
      isMissed: false,
      chapterNumber: 14,
      targetChapter: 14,
    };
    expect(
      getDisplayTargetChapterForDate(day3Key, readSession, suggestions, distribution)
    ).toBe(14);

    // Legacy read sessions without targetChapter still show static schedule
    const legacyRead: ChapterSessionLike = {
      isRead: true,
      isMissed: false,
      chapterNumber: 14,
    };
    expect(
      getDisplayTargetChapterForDate(day3Key, legacyRead, suggestions, distribution)
    ).toBe(15);
  });

  it("adapts unread day targets when ahead of schedule and freezes on mark", () => {
    const start = new Date(2026, 6, 5);
    const end = new Date(2026, 6, 9);
    const days = getAllDaysInRange(start, end);
    const totalChapters = 20;
    const distribution = distributeChaptersAcrossDays(totalChapters, start, end);

    // Static: 4 / 8 / 12 / 16 / 20
    expect(distribution.get(formatDateForStorage(days[0]!))).toBe(4);
    expect(distribution.get(formatDateForStorage(days[1]!))).toBe(8);
    expect(distribution.get(formatDateForStorage(days[2]!))).toBe(12);
    expect(distribution.get(formatDateForStorage(days[3]!))).toBe(16);
    expect(distribution.get(formatDateForStorage(days[4]!))).toBe(20);

    const sessions = new Map<string, ChapterSessionLike>();
    sessions.set(formatDateForStorage(days[0]!), {
      isRead: true,
      isMissed: false,
      chapterNumber: 4,
    });
    sessions.set(formatDateForStorage(days[1]!), {
      isRead: true,
      isMissed: false,
      chapterNumber: 15, // ahead of static target 8
    });

    const suggestions = computeChapterSuggestions(
      days,
      (dateKey) => sessions.get(dateKey),
      totalChapters,
      distribution,
      true
    );

    const day7Key = formatDateForStorage(days[2]!);
    const unreadTarget = getDisplayTargetChapterForDate(
      day7Key,
      undefined,
      suggestions,
      distribution
    );

    expect(getStaticTargetChapterForDate(day7Key, distribution)).toBe(12);
    expect(unreadTarget).toBeGreaterThan(15);
    expect(unreadTarget).not.toBe(12);

    // Marking the day freezes the adaptive target (e.g. 17), not static 12
    const marked: ChapterSessionLike = {
      isRead: true,
      isMissed: false,
      chapterNumber: unreadTarget,
      targetChapter: unreadTarget,
    };
    expect(
      getDisplayTargetChapterForDate(day7Key, marked, suggestions, distribution)
    ).toBe(unreadTarget);
  });
});
