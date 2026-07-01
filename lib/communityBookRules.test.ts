import { describe, expect, it } from "vitest";
import {
  canAccessCommunityBooks,
  validateCommunityBookInput,
} from "../convex/communityBookRules";
import { canManageCommunity } from "../convex/communityRules";

describe("community book rules", () => {
  it("allows page-based community books with pages", () => {
    expect(() =>
      validateCommunityBookInput({
        name: "Deep Work",
        progressStyle: "pages",
        totalPages: 296,
      })
    ).not.toThrow();
  });

  it("rejects page-based community books without pages", () => {
    expect(() =>
      validateCommunityBookInput({
        name: "Deep Work",
        progressStyle: "pages",
      })
    ).toThrow("Total pages is required unless pages are ignored");
  });

  it("allows chapter-only community books without pages", () => {
    expect(() =>
      validateCommunityBookInput({
        name: "The Practice",
        progressStyle: "chapters",
        ignorePages: true,
        totalChapters: 18,
      })
    ).not.toThrow();
  });

  it("rejects chapter-based community books without chapters", () => {
    expect(() =>
      validateCommunityBookInput({
        name: "The Practice",
        progressStyle: "chapters",
        totalPages: 240,
      })
    ).toThrow("Total chapters is required for chapter-based books");
  });

  it("keeps community book creation admin-only", () => {
    expect(canManageCommunity("owner")).toBe(true);
    expect(canManageCommunity("admin")).toBe(true);
    expect(canManageCommunity("member")).toBe(false);
    expect(canManageCommunity(undefined)).toBe(false);
  });

  it("locks private community books to members", () => {
    expect(canAccessCommunityBooks({ visibility: "private", isMember: true })).toBe(
      true
    );
    expect(canAccessCommunityBooks({ visibility: "private", isMember: false })).toBe(
      false
    );
    expect(canAccessCommunityBooks({ visibility: "public", isMember: false })).toBe(
      true
    );
  });
});
