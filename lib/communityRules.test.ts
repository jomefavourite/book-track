import { describe, expect, it } from "vitest";
import {
  canChangeMemberRole,
  canManageCommunity,
  canManageInvites,
  canRemoveMember,
  canViewPrivateActivity,
} from "../convex/communityRules";

describe("community role permissions", () => {
  it("limits community management to owners and admins", () => {
    expect(canManageCommunity("owner")).toBe(true);
    expect(canManageCommunity("admin")).toBe(true);
    expect(canManageCommunity("moderator")).toBe(false);
    expect(canManageCommunity("member")).toBe(false);
    expect(canManageInvites("admin")).toBe(true);
    expect(canManageInvites("member")).toBe(false);
  });

  it("allows only active member roles to view private activity", () => {
    expect(canViewPrivateActivity("owner")).toBe(true);
    expect(canViewPrivateActivity("admin")).toBe(true);
    expect(canViewPrivateActivity("moderator")).toBe(true);
    expect(canViewPrivateActivity("member")).toBe(true);
    expect(canViewPrivateActivity(undefined)).toBe(false);
  });

  it("keeps owner role changes owner-only and protects the owner role", () => {
    expect(canChangeMemberRole("owner", "member", "admin")).toBe(true);
    expect(canChangeMemberRole("admin", "member", "moderator")).toBe(false);
    expect(canChangeMemberRole("owner", "owner", "admin")).toBe(false);
    expect(canChangeMemberRole("owner", "admin", "owner")).toBe(false);
  });

  it("prevents removing owners", () => {
    expect(canRemoveMember("owner", "member")).toBe(true);
    expect(canRemoveMember("admin", "moderator")).toBe(true);
    expect(canRemoveMember("admin", "owner")).toBe(false);
    expect(canRemoveMember("member", "moderator")).toBe(false);
  });
});
