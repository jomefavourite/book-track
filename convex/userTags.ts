import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { sanitizeTags, normalizeTagKey } from "../lib/bookTags";

/**
 * Upsert a set of tags into a user's reusable vocabulary. Called whenever tags
 * are saved on a book so previously-used tags are suggested next time. Existing
 * tags (by normalized key) are left untouched. Safe to call with `[]`.
 */
export async function registerUserTags(
  ctx: MutationCtx,
  userId: string,
  tags: readonly string[]
) {
  if (!userId) return;
  for (const label of sanitizeTags(tags)) {
    const key = normalizeTagKey(label);
    const existing = await ctx.db
      .query("userTags")
      .withIndex("by_user_and_key", (q) =>
        q.eq("userId", userId).eq("key", key)
      )
      .first();
    if (existing) continue;
    await ctx.db.insert("userTags", {
      userId,
      label,
      key,
      createdAt: Date.now(),
    });
  }
}

/** All of a user's saved tag labels, alphabetically. */
export const getUserTags = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    if (!args.userId) return [];
    const rows = await ctx.db
      .query("userTags")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    return rows
      .map((row) => ({ _id: row._id, label: row.label, key: row.key }))
      .sort((a, b) => a.label.localeCompare(b.label));
  },
});

/** Create a tag directly (e.g. from the settings manager). Deduped by key. */
export const createUserTag = mutation({
  args: { userId: v.string(), label: v.string() },
  handler: async (ctx, args) => {
    if (!args.userId) {
      throw new Error("Not authenticated");
    }
    const [label] = sanitizeTags([args.label]);
    if (!label) {
      throw new Error("Tag cannot be empty");
    }
    const key = normalizeTagKey(label);
    const existing = await ctx.db
      .query("userTags")
      .withIndex("by_user_and_key", (q) =>
        q.eq("userId", args.userId).eq("key", key)
      )
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert("userTags", {
      userId: args.userId,
      label,
      key,
      createdAt: Date.now(),
    });
  },
});

/**
 * Remove a tag from the user's vocabulary. Books already tagged with it keep
 * the tag — this only stops it from being suggested.
 */
export const deleteUserTag = mutation({
  args: { userId: v.string(), tagId: v.id("userTags") },
  handler: async (ctx, args) => {
    if (!args.userId) {
      throw new Error("Not authenticated");
    }
    const tag = await ctx.db.get(args.tagId);
    if (!tag) return;
    if (tag.userId !== args.userId) {
      throw new Error("Unauthorized");
    }
    await ctx.db.delete(args.tagId);
  },
});
