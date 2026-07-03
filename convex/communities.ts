import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  canChangeMemberRole,
  canManageBooks,
  canManageCommunity,
  canManageInvites,
  canRemoveMember,
  type CommunityRole,
} from "./communityRules";
import {
  canAccessCommunityBooks,
  validateCommunityBookInput,
} from "./communityBookRules";
import {
  buildSessionsFromSchedule,
  getScheduleEntries,
} from "./communitySchedule";
import { getBookProgressPercent } from "./bookProgress";

const communityRoleValidator = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("moderator"),
  v.literal("member")
);

const inviteRoleValidator = v.union(
  v.literal("admin"),
  v.literal("moderator"),
  v.literal("member")
);

const progressStyleValidator = v.union(v.literal("pages"), v.literal("chapters"));

const readingModeValidator = v.union(
  v.literal("calendar"),
  v.literal("fixed-days")
);

function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function normalizeOptionalText(value: string | undefined) {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeBrandColor(value: string | undefined) {
  const color = normalizeOptionalText(value);
  if (!color) return undefined;
  return /^#[0-9a-fA-F]{6}$/.test(color) ? color : undefined;
}

function generateInviteToken() {
  if (globalThis.crypto && "randomUUID" in globalThis.crypto) {
    return globalThis.crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 14)}`;
}

async function requireClerkId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const clerkId = identity?.subject;
  if (!clerkId) {
    throw new Error("Not authenticated");
  }
  return {
    clerkId,
    name: identity.name,
    email: identity.email,
  };
}

async function getActiveCreatorGrant(ctx: QueryCtx | MutationCtx, clerkId: string) {
  const grants = await ctx.db
    .query("communityCreatorGrants")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .collect();
  return grants.find((grant) => grant.revokedAt === undefined);
}

async function getCreatorRequest(ctx: QueryCtx | MutationCtx, clerkId: string) {
  return await ctx.db
    .query("communityCreatorRequests")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
    .first();
}

async function hasCreatorAccess(ctx: QueryCtx | MutationCtx, clerkId: string) {
  const grant = await getActiveCreatorGrant(ctx, clerkId);
  if (grant) return true;
  const request = await getCreatorRequest(ctx, clerkId);
  return request?.status === "approved";
}

async function makeUniqueCommunitySlug(ctx: MutationCtx, name: string) {
  const baseSlug = slugify(name) || "community";
  let candidate = baseSlug;
  let suffix = 0;
  while (true) {
    const existing = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", candidate))
      .unique();
    if (!existing) {
      return candidate;
    }
    suffix += 1;
    candidate = `${baseSlug}-${suffix}`;
  }
}

async function getActiveMembership(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  clerkId: string
) {
  const membership = await ctx.db
    .query("communityMembers")
    .withIndex("by_community_and_clerk", (q) =>
      q.eq("communityId", communityId).eq("clerkId", clerkId)
    )
    .unique();

  return membership?.status === "active" ? membership : null;
}

async function getViewerRole(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  clerkId: string | undefined
): Promise<CommunityRole | undefined> {
  if (!clerkId) return undefined;
  const membership = await getActiveMembership(ctx, communityId, clerkId);
  return membership?.role;
}

async function getMemberCount(ctx: QueryCtx | MutationCtx, communityId: Id<"communities">) {
  const members = await ctx.db
    .query("communityMembers")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .collect();
  return members.filter((member) => member.status === "active").length;
}

const communityBookStatusValidator = v.union(
  v.literal("upcoming"),
  v.literal("active"),
  v.literal("completed")
);

function buildCommunityPreview(
  community: Doc<"communities">,
  memberCount: number,
  viewerRole?: CommunityRole
) {
  return {
    _id: community._id,
    name: community.name,
    slug: community.slug,
    description: community.description,
    visibility: community.visibility,
    joinPolicy: community.joinPolicy,
    currentBookTitle: community.currentBookTitle,
    currentBookAuthor: community.currentBookAuthor,
    totalChapters: community.totalChapters,
    ownerName: community.ownerName,
    brandColor: community.brandColor,
    memberCount,
    viewerRole,
    isMember: viewerRole !== undefined,
    isLocked: community.visibility === "private" && viewerRole === undefined,
    createdAt: community.createdAt,
  };
}

export const getCreatorStatus = query({
  args: {},
  handler: async (ctx) => {
    const { clerkId } = await requireClerkId(ctx);
    const grant = await getActiveCreatorGrant(ctx, clerkId);
    const request = await getCreatorRequest(ctx, clerkId);

    return {
      canCreate: grant !== undefined || request?.status === "approved",
      requestStatus: request?.status,
    };
  },
});

export const requestCreatorAccess = mutation({
  args: {
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clerkId, name, email } = await requireClerkId(ctx);
    const grant = await getActiveCreatorGrant(ctx, clerkId);
    if (grant) {
      return { status: "approved" as const };
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("communityCreatorRequests")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .first();

    const reason = normalizeOptionalText(args.reason);
    if (existing) {
      await ctx.db.patch(existing._id, {
        reason,
        name,
        email,
        status: existing.status === "approved" ? "approved" : "pending",
        updatedAt: now,
      });
      return { status: existing.status === "approved" ? "approved" as const : "pending" as const };
    }

    await ctx.db.insert("communityCreatorRequests", {
      clerkId,
      name,
      email,
      reason,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });

    return { status: "pending" as const };
  },
});

export const approveCreatorRequest = internalMutation({
  args: {
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
  },
  returns: v.object({
    requestId: v.id("communityCreatorRequests"),
    status: v.literal("approved"),
  }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("communityCreatorRequests")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        status: "approved",
        name: args.name ?? existing.name,
        email: args.email ?? existing.email,
        updatedAt: now,
      });
      return { requestId: existing._id, status: "approved" as const };
    }

    const requestId = await ctx.db.insert("communityCreatorRequests", {
      clerkId: args.clerkId,
      name: args.name,
      email: args.email,
      status: "approved",
      createdAt: now,
      updatedAt: now,
    });
    return { requestId, status: "approved" as const };
  },
});

export const createCommunity = mutation({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal("public"), v.literal("private")),
    brandColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clerkId, name } = await requireClerkId(ctx);
    const canCreate = await hasCreatorAccess(ctx, clerkId);
    if (!canCreate) {
      throw new Error("Community creator access is required");
    }

    const communityName = args.name.trim();
    if (communityName.length < 2) {
      throw new Error("Community name is required");
    }

    const now = Date.now();
    const communityId = await ctx.db.insert("communities", {
      name: communityName,
      slug: await makeUniqueCommunitySlug(ctx, communityName),
      description: normalizeOptionalText(args.description),
      visibility: args.visibility,
      joinPolicy: "invite_only",
      ownerClerkId: clerkId,
      ownerName: name,
      brandColor: normalizeBrandColor(args.brandColor),
      isArchived: false,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("communityMembers", {
      communityId,
      clerkId,
      role: "owner",
      status: "active",
      joinedAt: now,
      updatedAt: now,
    });

    const community = await ctx.db.get(communityId);
    return community;
  },
});

export const discoverCommunities = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const viewerClerkId = identity?.subject;
    const communities = await ctx.db.query("communities").order("desc").collect();
    const activeCommunities = communities.filter(
      (community) => community.isArchived !== true
    );

    return await Promise.all(
      activeCommunities.map(async (community) =>
        buildCommunityPreview(
          community,
          await getMemberCount(ctx, community._id),
          await getViewerRole(ctx, community._id, viewerClerkId)
        )
      )
    );
  },
});

export const getMyCommunities = query({
  args: {},
  handler: async (ctx) => {
    const { clerkId } = await requireClerkId(ctx);
    const memberships = await ctx.db
      .query("communityMembers")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .collect();

    const activeMemberships = memberships.filter(
      (membership) => membership.status === "active"
    );

    const communities = await Promise.all(
      activeMemberships.map(async (membership) => {
        const community = await ctx.db.get(membership.communityId);
        if (!community || community.isArchived === true) return null;
        return buildCommunityPreview(
          community,
          await getMemberCount(ctx, community._id),
          membership.role
        );
      })
    );

    return communities.filter((community) => community !== null);
  },
});

export const getCommunityBySlug = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const viewerClerkId = identity?.subject;
    const community = await ctx.db
      .query("communities")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (!community || community.isArchived === true) {
      return null;
    }

    const viewerRole = await getViewerRole(ctx, community._id, viewerClerkId);
    const memberCount = await getMemberCount(ctx, community._id);
    const logoUrl = community.logoStorageId
      ? await ctx.storage.getUrl(community.logoStorageId)
      : null;
    const preview = {
      ...buildCommunityPreview(community, memberCount, viewerRole),
      logoUrl,
    };

    if (community.visibility === "private" && viewerRole === undefined) {
      return {
        ...preview,
        access: "locked" as const,
      };
    }

    return {
      ...preview,
      access: viewerRole ? "member" as const : "public" as const,
      updatedAt: community.updatedAt,
    };
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireClerkId(ctx);
    return await ctx.storage.generateUploadUrl();
  },
});

export const saveCommunityLogo = mutation({
  args: {
    communityId: v.id("communities"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const community = await ctx.db.get(args.communityId);
    if (!community || community.isArchived === true) {
      throw new Error("Community not found");
    }
    const role = await getViewerRole(ctx, args.communityId, clerkId);
    if (!canManageCommunity(role)) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.communityId, {
      logoStorageId: args.storageId,
      updatedAt: Date.now(),
    });
  },
});

export const saveCommunityBookCover = mutation({
  args: {
    communityBookId: v.id("communityBooks"),
    storageId: v.id("_storage"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const book = await ctx.db.get(args.communityBookId);
    if (!book) {
      throw new Error("Community book not found");
    }
    const role = await getViewerRole(ctx, book.communityId, clerkId);
    if (!canManageBooks(role)) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.communityBookId, {
      coverImageStorageId: args.storageId,
      updatedAt: Date.now(),
    });
  },
});

export const updateCommunity = mutation({
  args: {
    communityId: v.id("communities"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    visibility: v.optional(v.union(v.literal("public"), v.literal("private"))),
    brandColor: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const community = await ctx.db.get(args.communityId);
    if (!community) {
      throw new Error("Community not found");
    }
    const role = await getViewerRole(ctx, args.communityId, clerkId);
    if (!canManageCommunity(role)) {
      throw new Error("Unauthorized");
    }

    const updates: Partial<Doc<"communities">> = {
      updatedAt: Date.now(),
    };

    if (args.name !== undefined) {
      const name = args.name.trim();
      if (name.length < 2) throw new Error("Community name is required");
      updates.name = name;
    }
    if (args.description !== undefined) {
      updates.description = normalizeOptionalText(args.description);
    }
    if (args.visibility !== undefined) {
      updates.visibility = args.visibility;
    }
    if (args.brandColor !== undefined) {
      updates.brandColor = normalizeBrandColor(args.brandColor);
    }

    await ctx.db.patch(args.communityId, updates);
  },
});

function buildCommunityBookPayload(
  args: {
    name: string;
    author?: string;
    totalPages?: number;
    totalChapters?: number;
    progressStyle?: "pages" | "chapters";
    ignorePages?: boolean;
    readingMode: "calendar" | "fixed-days";
    startMonth?: string;
    endMonth?: string;
    startYear?: number;
    endYear?: number;
    daysToRead?: number;
    startDate: string;
    endDate: string;
  }
) {
  const progressStyle = args.progressStyle ?? "pages";
  const ignorePages =
    progressStyle === "chapters" ? args.ignorePages ?? false : false;

  validateCommunityBookInput({
    name: args.name,
    totalPages: args.totalPages,
    totalChapters: args.totalChapters,
    progressStyle,
    ignorePages,
  });

  return {
    name: args.name.trim(),
    author: normalizeOptionalText(args.author),
    totalPages: args.totalPages,
    totalChapters:
      progressStyle === "chapters" ? args.totalChapters : undefined,
    progressStyle,
    ignorePages,
    readingMode: args.readingMode,
    startMonth: normalizeOptionalText(args.startMonth),
    endMonth: normalizeOptionalText(args.endMonth),
    startYear: args.startYear,
    endYear: args.endYear,
    daysToRead: args.daysToRead,
    startDate: args.startDate,
    endDate: args.endDate,
    updatedAt: Date.now(),
  };
}

export const createCommunityBook = mutation({
  args: {
    communityId: v.id("communities"),
    name: v.string(),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
    totalChapters: v.optional(v.number()),
    progressStyle: v.optional(progressStyleValidator),
    ignorePages: v.optional(v.boolean()),
    readingMode: readingModeValidator,
    startMonth: v.optional(v.string()),
    endMonth: v.optional(v.string()),
    startYear: v.optional(v.number()),
    endYear: v.optional(v.number()),
    daysToRead: v.optional(v.number()),
    startDate: v.string(),
    endDate: v.string(),
    coverImageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { clerkId, name } = await requireClerkId(ctx);
    const community = await ctx.db.get(args.communityId);
    if (!community || community.isArchived === true) {
      throw new Error("Community not found");
    }

    const role = await getViewerRole(ctx, args.communityId, clerkId);
    if (!canManageBooks(role)) {
      throw new Error("Unauthorized");
    }

    const payload = buildCommunityBookPayload(args);
    return await ctx.db.insert("communityBooks", {
      communityId: args.communityId,
      ...payload,
      coverImageStorageId: args.coverImageStorageId,
      status: "upcoming",
      createdByClerkId: clerkId,
      creatorName: name,
      createdAt: Date.now(),
      isArchived: false,
    });
  },
});

export const updateCommunityBook = mutation({
  args: {
    communityBookId: v.id("communityBooks"),
    name: v.string(),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
    totalChapters: v.optional(v.number()),
    progressStyle: v.optional(progressStyleValidator),
    ignorePages: v.optional(v.boolean()),
    readingMode: readingModeValidator,
    startMonth: v.optional(v.string()),
    endMonth: v.optional(v.string()),
    startYear: v.optional(v.number()),
    endYear: v.optional(v.number()),
    daysToRead: v.optional(v.number()),
    startDate: v.string(),
    endDate: v.string(),
    coverImageStorageId: v.optional(v.id("_storage")),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const existing = await ctx.db.get(args.communityBookId);
    if (!existing) {
      throw new Error("Community book not found");
    }

    const role = await getViewerRole(ctx, existing.communityId, clerkId);
    if (!canManageBooks(role)) {
      throw new Error("Unauthorized");
    }

    const payload = buildCommunityBookPayload(args);
    await ctx.db.patch(args.communityBookId, {
      ...payload,
      ...(args.coverImageStorageId !== undefined
        ? { coverImageStorageId: args.coverImageStorageId }
        : {}),
    });
  },
});

export const setCommunityBookStatus = mutation({
  args: {
    communityBookId: v.id("communityBooks"),
    status: communityBookStatusValidator,
    /** Demote the current active book to "completed" instead of failing */
    demoteCurrentActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const book = await ctx.db.get(args.communityBookId);
    if (!book || book.isArchived === true) {
      throw new Error("Community book not found");
    }

    const role = await getViewerRole(ctx, book.communityId, clerkId);
    if (!canManageBooks(role)) {
      throw new Error("Unauthorized");
    }

    const now = Date.now();

    if (args.status === "active") {
      const currentActive = await ctx.db
        .query("communityBooks")
        .withIndex("by_community_and_status", (q) =>
          q.eq("communityId", book.communityId).eq("status", "active")
        )
        .collect();
      for (const other of currentActive) {
        if (other._id === args.communityBookId || other.isArchived === true) {
          continue;
        }
        // Returned (not thrown) so the client can offer demote-and-switch;
        // thrown Error messages are redacted in production deployments.
        if (!args.demoteCurrentActive) {
          return {
            status: "conflict" as const,
            currentActiveName: other.name,
          };
        }
        await ctx.db.patch(other._id, {
          status: "completed",
          completedAt: other.completedAt ?? now,
          updatedAt: now,
        });
      }
    }

    await ctx.db.patch(args.communityBookId, {
      status: args.status,
      ...(args.status === "active" && book.startedAt === undefined
        ? { startedAt: now }
        : {}),
      ...(args.status === "completed" && book.completedAt === undefined
        ? { completedAt: now }
        : {}),
      updatedAt: now,
    });

    return { status: "ok" as const };
  },
});

export const archiveCommunityBook = mutation({
  args: {
    communityBookId: v.id("communityBooks"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const book = await ctx.db.get(args.communityBookId);
    if (!book) {
      throw new Error("Community book not found");
    }

    const role = await getViewerRole(ctx, book.communityId, clerkId);
    if (!canManageBooks(role)) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.communityBookId, {
      isArchived: true,
      updatedAt: Date.now(),
    });
  },
});

export const getCommunityBooks = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const viewerClerkId = identity?.subject;
    const community = await ctx.db.get(args.communityId);
    if (!community || community.isArchived === true) {
      throw new Error("Community not found");
    }

    const viewerRole = await getViewerRole(ctx, args.communityId, viewerClerkId);
    if (
      !canAccessCommunityBooks({
        visibility: community.visibility,
        isMember: viewerRole !== undefined,
      })
    ) {
      throw new Error("Unauthorized");
    }

    const books = await ctx.db
      .query("communityBooks")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .order("desc")
      .collect();

    return await Promise.all(
      books
        .filter((book) => book.isArchived !== true)
        .map(async (book) => ({
          ...book,
          coverImageUrl: book.coverImageStorageId
            ? await ctx.storage.getUrl(book.coverImageStorageId)
            : null,
        }))
    );
  },
});

export const getCommunityBook = query({
  args: {
    communityBookId: v.id("communityBooks"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const viewerClerkId = identity?.subject;
    const book = await ctx.db.get(args.communityBookId);
    if (!book || book.isArchived === true) {
      return null;
    }

    const community = await ctx.db.get(book.communityId);
    if (!community || community.isArchived === true) {
      return null;
    }

    const viewerRole = await getViewerRole(ctx, book.communityId, viewerClerkId);
    if (
      !canAccessCommunityBooks({
        visibility: community.visibility,
        isMember: viewerRole !== undefined,
      })
    ) {
      throw new Error("Unauthorized");
    }

    return {
      ...book,
      coverImageUrl: book.coverImageStorageId
        ? await ctx.storage.getUrl(book.coverImageStorageId)
        : null,
      viewerRole,
    };
  },
});

export const listCommunityMembers = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const role = await getViewerRole(ctx, args.communityId, clerkId);
    if (!canManageCommunity(role)) {
      throw new Error("Unauthorized");
    }

    const members = await ctx.db
      .query("communityMembers")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .collect();

    return await Promise.all(
      members
        .filter((member) => member.status === "active")
        .map(async (member) => {
          const user = await ctx.db
            .query("users")
            .withIndex("by_clerk_id", (q) => q.eq("clerkId", member.clerkId))
            .unique();

          return {
            _id: member._id,
            clerkId: member.clerkId,
            role: member.role,
            joinedAt: member.joinedAt,
            name: user?.name,
            email: user?.email,
            imageUrl: user?.imageUrl,
          };
        })
    );
  },
});

export const listInvites = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const role = await getViewerRole(ctx, args.communityId, clerkId);
    if (!canManageInvites(role)) {
      throw new Error("Unauthorized");
    }

    return await ctx.db
      .query("communityInvites")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .order("desc")
      .collect();
  },
});

export const createInvite = mutation({
  args: {
    communityId: v.id("communities"),
    roleToGrant: inviteRoleValidator,
    expiresInDays: v.optional(v.number()),
    maxUses: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const role = await getViewerRole(ctx, args.communityId, clerkId);
    if (!canManageInvites(role)) {
      throw new Error("Unauthorized");
    }

    const expiresInDays =
      args.expiresInDays !== undefined && args.expiresInDays > 0
        ? Math.floor(args.expiresInDays)
        : undefined;
    const maxUses =
      args.maxUses !== undefined && args.maxUses > 0
        ? Math.floor(args.maxUses)
        : undefined;
    const now = Date.now();
    const token = generateInviteToken();

    await ctx.db.insert("communityInvites", {
      communityId: args.communityId,
      token,
      createdByClerkId: clerkId,
      roleToGrant: args.roleToGrant,
      expiresAt: expiresInDays
        ? now + expiresInDays * 24 * 60 * 60 * 1000
        : undefined,
      maxUses,
      usedCount: 0,
      createdAt: now,
    });

    return { token };
  },
});

export const disableInvite = mutation({
  args: {
    inviteId: v.id("communityInvites"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const invite = await ctx.db.get(args.inviteId);
    if (!invite) {
      throw new Error("Invite not found");
    }
    const role = await getViewerRole(ctx, invite.communityId, clerkId);
    if (!canManageInvites(role)) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.inviteId, { disabledAt: Date.now() });
  },
});

export const getInvitePreview = query({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const invite = await ctx.db
      .query("communityInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invite) {
      return null;
    }

    const community = await ctx.db.get(invite.communityId);
    if (!community || community.isArchived === true) {
      return null;
    }

    const now = Date.now();
    const isExpired = invite.expiresAt !== undefined && invite.expiresAt < now;
    const isUsedUp =
      invite.maxUses !== undefined && invite.usedCount >= invite.maxUses;
    const isActive =
      invite.disabledAt === undefined && !isExpired && !isUsedUp;

    return {
      community: {
        ...buildCommunityPreview(
          community,
          await getMemberCount(ctx, community._id)
        ),
        logoUrl: community.logoStorageId
          ? await ctx.storage.getUrl(community.logoStorageId)
          : null,
      },
      roleToGrant: invite.roleToGrant,
      isActive,
      isExpired,
      isUsedUp,
    };
  },
});

export const acceptInvite = mutation({
  args: {
    token: v.string(),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const invite = await ctx.db
      .query("communityInvites")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .unique();

    if (!invite) {
      throw new Error("Invite not found");
    }
    const community = await ctx.db.get(invite.communityId);
    if (!community || community.isArchived === true) {
      throw new Error("Community not found");
    }

    const now = Date.now();
    if (invite.disabledAt !== undefined) {
      throw new Error("Invite has been disabled");
    }
    if (invite.expiresAt !== undefined && invite.expiresAt < now) {
      throw new Error("Invite has expired");
    }
    if (invite.maxUses !== undefined && invite.usedCount >= invite.maxUses) {
      throw new Error("Invite has already been used");
    }

    const existing = await ctx.db
      .query("communityMembers")
      .withIndex("by_community_and_clerk", (q) =>
        q.eq("communityId", invite.communityId).eq("clerkId", clerkId)
      )
      .unique();

    if (existing?.status === "active") {
      return { slug: community.slug, alreadyMember: true };
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        role: invite.roleToGrant,
        status: "active",
        updatedAt: now,
      });
    } else {
      await ctx.db.insert("communityMembers", {
        communityId: invite.communityId,
        clerkId,
        role: invite.roleToGrant,
        status: "active",
        joinedAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.patch(invite._id, {
      usedCount: invite.usedCount + 1,
    });

    const identity = await ctx.auth.getUserIdentity();
    await ctx.scheduler.runAfter(
      0,
      internal.communityNotifications.notifyAdminsOfNewMember,
      {
        communityId: invite.communityId,
        newMemberClerkId: clerkId,
        newMemberName: identity?.name ?? "Someone",
        communityName: community.name,
        communitySlug: community.slug,
      }
    );

    return { slug: community.slug, alreadyMember: false };
  },
});

export const updateMemberRole = mutation({
  args: {
    memberId: v.id("communityMembers"),
    role: communityRoleValidator,
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error("Member not found");
    }
    const actorRole = await getViewerRole(ctx, member.communityId, clerkId);
    if (!canChangeMemberRole(actorRole, member.role, args.role)) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.memberId, {
      role: args.role,
      updatedAt: Date.now(),
    });
  },
});

export const removeMember = mutation({
  args: {
    memberId: v.id("communityMembers"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const member = await ctx.db.get(args.memberId);
    if (!member) {
      throw new Error("Member not found");
    }
    const actorRole = await getViewerRole(ctx, member.communityId, clerkId);
    if (!canRemoveMember(actorRole, member.role)) {
      throw new Error("Unauthorized");
    }
    await ctx.db.patch(args.memberId, {
      status: "removed",
      updatedAt: Date.now(),
    });
  },
});

export const getCommunityForBook = query({
  args: {
    communityBookId: v.id("communityBooks"),
  },
  handler: async (ctx, args) => {
    const communityBook = await ctx.db.get(args.communityBookId);
    if (!communityBook) return null;
    const community = await ctx.db.get(communityBook.communityId);
    if (!community || community.isArchived === true) return null;
    return { _id: community._id, name: community.name, slug: community.slug };
  },
});

export const getMyTrackingForCommunityBook = query({
  args: {
    communityBookId: v.id("communityBooks"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const clerkId = identity.subject;
    const personalBook = await ctx.db
      .query("books")
      .withIndex("by_community_book_id", (q) =>
        q.eq("communityBookId", args.communityBookId)
      )
      .filter((q) => q.eq(q.field("userId"), clerkId))
      .first();
    return personalBook ? personalBook._id : null;
  },
});

export const trackCommunityBook = mutation({
  args: {
    communityBookId: v.id("communityBooks"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);

    const communityBook = await ctx.db.get(args.communityBookId);
    if (!communityBook || communityBook.isArchived === true) {
      throw new Error("Community book not found");
    }

    const membership = await getActiveMembership(ctx, communityBook.communityId, clerkId);
    if (!membership) {
      throw new Error("You must be a member of this community to track its books");
    }

    const existing = await ctx.db
      .query("books")
      .withIndex("by_community_book_id", (q) =>
        q.eq("communityBookId", args.communityBookId)
      )
      .filter((q) => q.eq(q.field("userId"), clerkId))
      .first();
    if (existing) {
      return existing._id;
    }

    const bookId = await ctx.db.insert("books", {
      userId: clerkId,
      name: communityBook.name,
      author: communityBook.author,
      totalPages: communityBook.totalPages,
      totalChapters: communityBook.totalChapters,
      progressStyle: communityBook.progressStyle,
      ignorePages: communityBook.ignorePages,
      readingMode: communityBook.readingMode,
      startMonth: communityBook.startMonth,
      endMonth: communityBook.endMonth,
      startYear: communityBook.startYear,
      endYear: communityBook.endYear,
      daysToRead: communityBook.daysToRead,
      startDate: communityBook.startDate,
      endDate: communityBook.endDate,
      isPublic: false,
      communityBookId: args.communityBookId,
      createdAt: Date.now(),
    });

    // Seed sessions from the community reading schedule (if one exists) so
    // rest/reflection/catch-up days and chapter assignments carry over.
    const schedule = await getScheduleEntries(ctx, args.communityBookId);
    if (schedule.length > 0) {
      const book = await ctx.db.get(bookId);
      if (book) {
        const planned = buildSessionsFromSchedule(book, schedule);
        await Promise.all(
          planned.map((day) =>
            ctx.db.insert("readingSessions", {
              bookId,
              userId: clerkId,
              date: day.date,
              plannedPages: day.plannedPages,
              chapterNumber: day.chapterNumber,
              isRead: false,
              createdAt: Date.now(),
            })
          )
        );
      }
    }

    return bookId;
  },
});

export const getCommunityBookReflections = query({
  args: {
    communityBookId: v.id("communityBooks"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);

    const communityBook = await ctx.db.get(args.communityBookId);
    if (!communityBook || communityBook.isArchived === true) {
      throw new Error("Community book not found");
    }

    const membership = await getActiveMembership(
      ctx,
      communityBook.communityId,
      clerkId
    );
    if (!membership) {
      throw new Error("Unauthorized");
    }

    const personalBooks = await ctx.db
      .query("books")
      .withIndex("by_community_book_id", (q) =>
        q.eq("communityBookId", args.communityBookId)
      )
      .collect();

    const results = await Promise.all(
      personalBooks.map(async (personalBook) => {
        const sessions = await ctx.db
          .query("readingSessions")
          .withIndex("by_book", (q) => q.eq("bookId", personalBook._id))
          .collect();

        const reflectionSessions = sessions.filter(
          (session) =>
            session.isRead &&
            session.isMissed !== true &&
            typeof session.reflectionNote === "string" &&
            session.reflectionNote.trim().length > 0
        );

        if (reflectionSessions.length === 0) return [];

        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", personalBook.userId))
          .unique();

        return reflectionSessions.map((session) => ({
          sessionId: session._id,
          userId: personalBook.userId,
          userName: user?.name,
          userImageUrl: user?.imageUrl,
          date: session.date,
          chapterNumber:
            typeof session.chapterNumber === "number"
              ? session.chapterNumber
              : undefined,
          reflectionNote: session.reflectionNote!.trim(),
        }));
      })
    );

    return results.flat().sort((a, b) => b.date.localeCompare(a.date));
  },
});

export const getCommunityMemberProgress = query({
  args: {
    communityId: v.id("communities"),
  },
  handler: async (ctx, args) => {
    const { clerkId } = await requireClerkId(ctx);
    const role = await getViewerRole(ctx, args.communityId, clerkId);
    if (!canManageCommunity(role)) {
      throw new Error("Unauthorized");
    }

    const communityBooks = await ctx.db
      .query("communityBooks")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .collect();
    const activeBooks = communityBooks.filter((b) => b.isArchived !== true);

    const memberDocs = await ctx.db
      .query("communityMembers")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .filter((q) => q.eq(q.field("status"), "active"))
      .collect();

    const members = await Promise.all(
      memberDocs.map(async (m) => {
        const user = await ctx.db
          .query("users")
          .withIndex("by_clerk_id", (q) => q.eq("clerkId", m.clerkId))
          .unique();
        return {
          _id: m._id,
          clerkId: m.clerkId,
          role: m.role,
          name: user?.name,
          email: user?.email,
        };
      })
    );

    const result = await Promise.all(
      activeBooks.map(async (communityBook) => {
        const memberProgress = await Promise.all(
          members.map(async (member) => {
            const personalBook = await ctx.db
              .query("books")
              .withIndex("by_community_book_id", (q) =>
                q.eq("communityBookId", communityBook._id)
              )
              .filter((q) => q.eq(q.field("userId"), member.clerkId))
              .first();

            if (!personalBook) {
              return {
                clerkId: member.clerkId,
                name: member.name,
                email: member.email,
                role: member.role,
                isTracking: false as const,
                progress: 0,
                lastReadDate: undefined as string | undefined,
              };
            }

            const sessions = await ctx.db
              .query("readingSessions")
              .withIndex("by_book", (q) => q.eq("bookId", personalBook._id))
              .collect();

            const progress = getBookProgressPercent(personalBook, sessions);

            const lastRead = sessions
              .filter((s) => s.isRead && !s.isMissed)
              .sort((a, b) => b.date.localeCompare(a.date))[0];

            return {
              clerkId: member.clerkId,
              name: member.name,
              email: member.email,
              role: member.role,
              isTracking: true as const,
              progress,
              lastReadDate: lastRead?.date as string | undefined,
            };
          })
        );

        return {
          communityBook: {
            _id: communityBook._id,
            name: communityBook.name,
            author: communityBook.author,
            totalPages: communityBook.totalPages,
            totalChapters: communityBook.totalChapters,
            progressStyle: communityBook.progressStyle,
            ignorePages: communityBook.ignorePages,
            startDate: communityBook.startDate,
            endDate: communityBook.endDate,
            readingMode: communityBook.readingMode,
            daysToRead: communityBook.daysToRead,
          },
          members: memberProgress.sort((a, b) => b.progress - a.progress),
        };
      })
    );

    return result;
  },
});
