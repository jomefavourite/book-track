import { ConvexError } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";

/**
 * Self-serve account deletion. Clerk identity comes from the auth token, never
 * from arguments, so a user can only ever delete their own data. The Clerk
 * account itself is deleted afterwards by app/api/account/route.ts.
 */

async function requireClerkId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) {
    throw new ConvexError("Not authenticated");
  }
  return identity.subject;
}

/** Communities the user still owns. These must be deleted (or handed over) first. */
async function getOwnedCommunities(ctx: QueryCtx | MutationCtx, clerkId: string) {
  const memberships = await ctx.db
    .query("communityMembers")
    .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
    .collect();

  const owned = [];
  for (const membership of memberships) {
    if (membership.role !== "owner" || membership.status !== "active") continue;
    const community = await ctx.db.get(membership.communityId);
    if (community) {
      owned.push({ _id: community._id, name: community.name, slug: community.slug });
    }
  }
  return owned;
}

export const getDeletionBlockers = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity?.subject) return null;
    return { ownedCommunities: await getOwnedCommunities(ctx, identity.subject) };
  },
});

export const deleteMyAccount = mutation({
  args: {},
  handler: async (ctx) => {
    const clerkId = await requireClerkId(ctx);

    const ownedCommunities = await getOwnedCommunities(ctx, clerkId);
    if (ownedCommunities.length > 0) {
      throw new ConvexError(
        "Delete or hand over the communities you own before deleting your account."
      );
    }

    // Reading logs (including reflection notes), then the books themselves.
    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .collect();
    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    const books = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .collect();
    for (const book of books) {
      await ctx.db.delete(book._id);
    }

    const tags = await ctx.db
      .query("userTags")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .collect();
    for (const tag of tags) {
      await ctx.db.delete(tag._id);
    }

    // Community memberships. Books the user added to other people's communities
    // stay with the community, but no longer carry the user's name.
    const memberships = await ctx.db
      .query("communityMembers")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .collect();
    for (const membership of memberships) {
      const communityBooks = await ctx.db
        .query("communityBooks")
        .withIndex("by_community", (q) => q.eq("communityId", membership.communityId))
        .collect();
      for (const communityBook of communityBooks) {
        if (communityBook.createdByClerkId === clerkId && communityBook.creatorName) {
          await ctx.db.patch(communityBook._id, { creatorName: undefined });
        }
      }
      await ctx.db.delete(membership._id);
    }

    const creatorRequests = await ctx.db
      .query("communityCreatorRequests")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .collect();
    for (const request of creatorRequests) {
      await ctx.db.delete(request._id);
    }

    const creatorGrants = await ctx.db
      .query("communityCreatorGrants")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .collect();
    for (const grant of creatorGrants) {
      await ctx.db.delete(grant._id);
    }

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (user) {
      const pushSubscriptions = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();
      for (const subscription of pushSubscriptions) {
        await ctx.db.delete(subscription._id);
      }

      for (const jobId of [user.reminder1ScheduledJobId, user.reminder2ScheduledJobId]) {
        if (!jobId) continue;
        try {
          await ctx.scheduler.cancel(jobId as Id<"_scheduled_functions">);
        } catch {
          // Already ran or was cancelled; nothing to clean up.
        }
      }

      await ctx.db.delete(user._id);
    }

    return {
      books: books.length,
      readingSessions: sessions.length,
      communitiesLeft: memberships.length,
    };
  },
});
