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
  });
});
