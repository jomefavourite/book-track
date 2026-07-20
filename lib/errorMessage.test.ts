import { describe, it, expect } from "vitest";
import { toUserMessage } from "./errorMessage";

describe("toUserMessage", () => {
  it("extracts the thrown sentence from a Convex mutation error", () => {
    // Verbatim shape reported from the day-labels form.
    const raw =
      "[CONVEX M(communityDayLabels:createLabel)] [Request ID: 7d36cd1d3437dbc7] " +
      "Server Error Uncaught Error: Give the day label a name. " +
      "at handler (../../convex/communityDayLabels.ts:187:21) Called by client";
    expect(toUserMessage(raw)).toBe("Give the day label a name.");
  });

  it("keeps multi-sentence messages intact", () => {
    const raw =
      "[CONVEX M(x:y)] Server Error Uncaught Error: Keep at least one reading " +
      "day label — members need somewhere to be assigned reading. " +
      "at handler (../../convex/communityDayLabels.ts:1:1)";
    expect(toUserMessage(raw)).toBe(
      "Keep at least one reading day label — members need somewhere to be assigned reading."
    );
  });

  it("never leaks file paths, request ids, or convex prefixes", () => {
    const raw =
      "[CONVEX M(a:b)] [Request ID: deadbeef] Server Error Uncaught ConvexError: Nope. " +
      "at handler (../../convex/a.ts:9:9) Called by client";
    const out = toUserMessage(raw);
    expect(out).toBe("Nope.");
    for (const leak of ["CONVEX", "Request ID", "convex/", "at handler"]) {
      expect(out).not.toContain(leak);
    }
  });

  it("passes through plain errors unchanged", () => {
    expect(toUserMessage(new Error("Network request failed"))).toBe(
      "Network request failed"
    );
  });

  it("falls back for empty, unknown, or stack-only input", () => {
    expect(toUserMessage(undefined)).toBe(
      "Something went wrong. Please try again."
    );
    expect(toUserMessage("   ")).toBe("Something went wrong. Please try again.");
    expect(toUserMessage({ weird: true })).toBe(
      "Something went wrong. Please try again."
    );
    expect(toUserMessage("Uncaught Error:  at handler (x.ts:1:1)", "fb")).toBe(
      "fb"
    );
  });

  it("honors a caller-supplied fallback", () => {
    expect(toUserMessage(null, "Unable to save the schedule.")).toBe(
      "Unable to save the schedule."
    );
  });
});
