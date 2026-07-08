import { describe, it, expect } from "vitest";
import {
  distributeAcrossReadingDays,
  balancePageTargets,
  balanceChapterTargets,
  type BalanceDay,
} from "./readingCalculator";

const unlocked = (values: number[]): BalanceDay[] =>
  values.map((value) => ({ value, locked: false }));

describe("distributeAcrossReadingDays", () => {
  it("sums to the total with the remainder front-loaded", () => {
    const result = distributeAcrossReadingDays(10, 3);
    expect(result).toEqual([4, 3, 3]);
    expect(result.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("returns an empty array when there are no reading days", () => {
    expect(distributeAcrossReadingDays(10, 0)).toEqual([]);
  });
});

describe("balancePageTargets", () => {
  it("covers the total exactly when nothing is locked", () => {
    const result = balancePageTargets(unlocked([0, 0, 0, 0]), 100);
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result).toEqual([25, 25, 25, 25]);
  });

  it("keeps locked days and balances the rest to hit the total", () => {
    const days: BalanceDay[] = [
      { value: 40, locked: true },
      { value: 0, locked: false },
      { value: 0, locked: false },
      { value: 0, locked: false },
    ];
    const result = balancePageTargets(days, 100);
    expect(result[0]).toBe(40); // locked, preserved
    expect(result.reduce((a, b) => a + b, 0)).toBe(100);
    expect(result.slice(1)).toEqual([20, 20, 20]);
  });

  it("drops unlocked days to 0 when locked pages already exceed the total", () => {
    const days: BalanceDay[] = [
      { value: 120, locked: true },
      { value: 5, locked: false },
    ];
    const result = balancePageTargets(days, 100);
    expect(result).toEqual([120, 0]);
  });
});

describe("balanceChapterTargets", () => {
  it("reaches the total on the last day and stays monotonic when unlocked", () => {
    const result = balanceChapterTargets(unlocked([0, 0, 0, 0, 0]), 20);
    expect(result[result.length - 1]).toBe(20);
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
    }
  });

  it("preserves a locked mid-day, interpolates around it, and reaches the total", () => {
    const days: BalanceDay[] = [
      { value: 0, locked: false },
      { value: 0, locked: false },
      { value: 3, locked: true }, // day 3 pinned at chapter 3
      { value: 0, locked: false },
      { value: 0, locked: false },
      { value: 0, locked: false },
    ];
    const result = balanceChapterTargets(days, 12);
    expect(result[2]).toBe(3); // locked, preserved
    expect(result[result.length - 1]).toBe(12); // reaches total
    for (let i = 1; i < result.length; i++) {
      expect(result[i]).toBeGreaterThanOrEqual(result[i - 1]);
    }
  });

  it("clamps values within [1, total]", () => {
    const result = balanceChapterTargets(unlocked([0, 0, 0]), 2);
    result.forEach((value) => {
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(2);
    });
    expect(result[result.length - 1]).toBe(2);
  });
});
