import { describe, expect, it } from "vitest";
import {
  calculatePagesCoveredFromStopPage,
  clampStopPageInputValue,
  getDefaultStopPageForDate,
  getInferredStopPageByDate,
  getPreviousStopPage,
} from "./pageTracking";

describe("page tracking", () => {
  it("treats the first stopped page as the first daily page count", () => {
    expect(
      calculatePagesCoveredFromStopPage({
        stopPage: 30,
        previousStopPage: 0,
        totalPages: 200,
      })
    ).toEqual({ stopPage: 30, actualPages: 30 });
  });

  it("calculates the daily delta from the previous stopped page", () => {
    expect(
      calculatePagesCoveredFromStopPage({
        stopPage: 50,
        previousStopPage: 30,
        totalPages: 200,
      })
    ).toEqual({ stopPage: 50, actualPages: 20 });
  });

  it("infers stop pages for legacy sessions without stopPage", () => {
    const stops = getInferredStopPageByDate(
      [
        {
          date: "2026-06-01",
          plannedPages: 15,
          actualPages: 12,
          isRead: true,
        },
        {
          date: "2026-06-02",
          plannedPages: 15,
          isRead: true,
        },
      ],
      100
    );

    expect(stops.get("2026-06-01")).toBe(12);
    expect(stops.get("2026-06-02")).toBe(27);
  });

  it("uses explicit stop pages when finding the prior stop", () => {
    expect(
      getPreviousStopPage(
        [
          {
            date: "2026-06-01",
            plannedPages: 10,
            stopPage: 35,
            actualPages: 35,
            isRead: true,
          },
        ],
        "2026-06-02",
        200
      )
    ).toBe(35);
  });

  it("defaults a new read day to previous stop plus planned pages", () => {
    expect(
      getDefaultStopPageForDate({
        sessions: [
          {
            date: "2026-06-01",
            plannedPages: 20,
            stopPage: 40,
            actualPages: 40,
            isRead: true,
          },
        ],
        dateKey: "2026-06-02",
        plannedPages: 25,
        totalPages: 120,
      })
    ).toEqual({ stopPage: 65, actualPages: 25 });
  });

  it("clamps stop pages to the book total", () => {
    expect(
      calculatePagesCoveredFromStopPage({
        stopPage: 140,
        previousStopPage: 90,
        totalPages: 120,
      })
    ).toEqual({ stopPage: 120, actualPages: 30 });
  });

  it("clamps stop page input values while preserving empty input", () => {
    expect(clampStopPageInputValue("89", 43)).toBe("43");
    expect(clampStopPageInputValue("-4", 43)).toBe("0");
    expect(clampStopPageInputValue("", 43)).toBe("");
  });
});
