import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId;
    if (!clerkId) throw new Error("clerkId is required");

    const now = Date.now();
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();

    const name = args.name ?? existing?.name ?? undefined;
    const email = args.email ?? existing?.email ?? undefined;
    const imageUrl = args.imageUrl ?? existing?.imageUrl ?? undefined;

    let slug: string;
    if (existing) {
      const nameBasedSlug =
        name && slugify(name).length > 0 ? slugify(name) : null;
      const isFallbackSlug = existing.slug.startsWith("user-");

      if (nameBasedSlug && (isFallbackSlug || existing.slug !== nameBasedSlug)) {
        let candidate = nameBasedSlug;
        let suffix = 0;
        while (true) {
          const taken = await ctx.db
            .query("users")
            .withIndex("by_slug", (q) => q.eq("slug", candidate))
            .unique();
          if (!taken || taken.clerkId === clerkId) break;
          suffix += 1;
          candidate = `${nameBasedSlug}-${suffix}`;
        }
        slug = candidate;
      } else {
        slug = existing.slug;
      }
    } else {
      const baseSlug =
        name && slugify(name).length > 0
          ? slugify(name)
          : `user-${clerkId.replace(/[^a-z0-9]/gi, "").slice(-8)}`;
      let candidate = baseSlug;
      let suffix = 0;
      while (true) {
        const taken = await ctx.db
          .query("users")
          .withIndex("by_slug", (q) => q.eq("slug", candidate))
          .unique();
        if (!taken || taken.clerkId === clerkId) break;
        suffix += 1;
        candidate = `${baseSlug}-${suffix}`;
      }
      slug = candidate;
    }

    if (existing) {
      await ctx.db.patch(existing._id, {
        name,
        email,
        imageUrl,
        slug,
        updatedAt: now,
      });

      // Keep books in sync: update creatorName/creatorEmail on all this user's books
      const books = await ctx.db
        .query("books")
        .withIndex("by_user", (q) => q.eq("userId", clerkId))
        .collect();
      for (const book of books) {
        await ctx.db.patch(book._id, {
          creatorName: name ?? book.creatorName,
          creatorEmail: email ?? book.creatorEmail,
        });
      }

      return existing._id;
    }

    const userId = await ctx.db.insert("users", {
      clerkId,
      name,
      email,
      imageUrl,
      slug,
      createdAt: now,
      updatedAt: now,
    });
    return userId;
  },
});

export const getUserByClerkId = query({
  args: { clerkId: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
  },
});

export const getUserBySlugOrId = query({
  args: { slugOrId: v.string() },
  handler: async (ctx, args) => {
    const slugOrId = args.slugOrId;
    // Try as clerkId first
    const byClerk = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", slugOrId))
      .unique();
    if (byClerk) return byClerk;
    // Then by slug
    return await ctx.db
      .query("users")
      .withIndex("by_slug", (q) => q.eq("slug", slugOrId))
      .unique();
  },
});

export const updateProfile = mutation({
  args: {
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    slug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = args.clerkId;
    if (!clerkId) throw new Error("clerkId is required");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) throw new Error("User not found");

    const now = Date.now();
    const updates: {
      name?: string;
      email?: string;
      imageUrl?: string;
      slug?: string;
      updatedAt: number;
    } = { updatedAt: now };

    if (args.name !== undefined) updates.name = args.name;
    if (args.email !== undefined) updates.email = args.email;
    if (args.imageUrl !== undefined) updates.imageUrl = args.imageUrl;

    if (args.slug !== undefined) {
      const candidate = slugify(args.slug) || user.slug;
      const taken = await ctx.db
        .query("users")
        .withIndex("by_slug", (q) => q.eq("slug", candidate))
        .unique();
      if (!taken || taken.clerkId === clerkId) {
        updates.slug = candidate;
      }
    }

    await ctx.db.patch(user._id, updates);

    // Sync creator fields to all this user's books
    const books = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", clerkId))
      .collect();
    const name = updates.name ?? user.name;
    const email = updates.email ?? user.email;
    for (const book of books) {
      await ctx.db.patch(book._id, {
        ...(name !== undefined && { creatorName: name }),
        ...(email !== undefined && { creatorEmail: email }),
      });
    }

    return user._id;
  },
});
