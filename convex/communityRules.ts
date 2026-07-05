export const COMMUNITY_ROLES = ["owner", "admin", "moderator", "member"] as const;

export type CommunityRole = (typeof COMMUNITY_ROLES)[number];

export const ACTIVE_MEMBER_STATUS = "active";

export function isCommunityRole(value: string): value is CommunityRole {
  return COMMUNITY_ROLES.includes(value as CommunityRole);
}

export function canManageCommunity(role?: CommunityRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageBooks(role?: CommunityRole): boolean {
  return role === "owner" || role === "admin" || role === "moderator";
}

export function canManageInvites(role?: CommunityRole): boolean {
  return role === "owner" || role === "admin";
}

export function canManageMembers(role?: CommunityRole): boolean {
  return role === "owner" || role === "admin";
}

export function canViewPrivateActivity(role?: CommunityRole): boolean {
  return role === "owner" || role === "admin" || role === "moderator" || role === "member";
}

export function canChangeMemberRole(
  actorRole: CommunityRole | undefined,
  targetRole: CommunityRole,
  nextRole: CommunityRole
): boolean {
  if (actorRole !== "owner") {
    return false;
  }
  if (targetRole === "owner" || nextRole === "owner") {
    return false;
  }
  return true;
}

export function canRemoveMember(
  actorRole: CommunityRole | undefined,
  targetRole: CommunityRole
): boolean {
  if (targetRole === "owner") {
    return false;
  }
  return actorRole === "owner" || actorRole === "admin";
}
