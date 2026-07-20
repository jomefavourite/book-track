import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { canManageBooks, canManageCommunity } from "./communityRules";
import { canAccessCommunityBooks } from "./communityBookRules";
import {
  DEFAULT_DAY_LABELS,
  LEGACY_DAY_TYPE_BEHAVIOR,
  dayBehaviorValidator,
  type DayBehavior,
} from "./dayBehavior";

async function getViewerRole(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">,
  clerkId: string | undefined
) {
  if (!clerkId) return undefined;
  const membership = await ctx.db
    .query("communityMembers")
    .withIndex("by_community_and_clerk", (q) =>
      q.eq("communityId", communityId).eq("clerkId", clerkId)
    )
    .unique();
  return membership?.status === "active" ? membership.role : undefined;
}

async function requireCommunityManager(
  ctx: MutationCtx,
  communityId: Id<"communities">
) {
  const identity = await ctx.auth.getUserIdentity();
  const clerkId = identity?.subject;
  if (!clerkId) {
    throw new Error("Not authenticated");
  }
  const role = await getViewerRole(ctx, communityId, clerkId);
  if (!canManageCommunity(role)) {
    throw new Error("Unauthorized");
  }
}

async function readLabels(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">
) {
  const labels = await ctx.db
    .query("communityDayLabels")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .collect();
  return labels.sort((a, b) => a.order - b.order);
}

/**
 * Seeds the four defaults that reproduce the pre-day-label behavior exactly.
 * Idempotent: keyed on `legacyDayType`, so repeated or concurrent calls can
 * never duplicate a label, and labels the admin has since renamed are left
 * alone (renaming does not clear `legacyDayType`).
 */
export async function ensureDefaultLabels(
  ctx: MutationCtx,
  communityId: Id<"communities">
): Promise<Doc<"communityDayLabels">[]> {
  const existing = await readLabels(ctx, communityId);
  const seenLegacy = new Set(
    existing
      .map((label) => label.legacyDayType)
      .filter((value): value is string => value !== undefined)
  );

  const missing = DEFAULT_DAY_LABELS.filter(
    (preset) => !seenLegacy.has(preset.legacyDayType)
  );
  if (missing.length === 0) {
    return existing;
  }

  const now = Date.now();
  let order = existing.reduce((max, label) => Math.max(max, label.order), -1);
  for (const preset of missing) {
    order += 1;
    await ctx.db.insert("communityDayLabels", {
      communityId,
      name: preset.name,
      behavior: preset.behavior,
      icon: preset.icon,
      legacyDayType: preset.legacyDayType,
      order,
      createdAt: now,
      updatedAt: now,
    });
  }

  return await readLabels(ctx, communityId);
}

async function assertCanReadCommunity(
  ctx: QueryCtx,
  communityId: Id<"communities">
) {
  const community = await ctx.db.get(communityId);
  if (!community || community.isArchived === true) {
    return null;
  }
  const identity = await ctx.auth.getUserIdentity();
  const viewerRole = await getViewerRole(ctx, communityId, identity?.subject);
  if (
    !canAccessCommunityBooks({
      visibility: community.visibility,
      isMember: viewerRole !== undefined,
    })
  ) {
    throw new Error("Unauthorized");
  }
  return community;
}

/**
 * Queries can't insert, so seeding happens on write paths and on community
 * creation. Readers that find no rows yet fall back to the in-memory defaults,
 * which resolve identically — the UI never sees an empty label set.
 */
function withFallbackDefaults(labels: Doc<"communityDayLabels">[]) {
  if (labels.length > 0) {
    return labels.filter((label) => label.isArchived !== true);
  }
  return DEFAULT_DAY_LABELS.map((preset, index) => ({
    _id: `default:${preset.legacyDayType}`,
    name: preset.name,
    behavior: preset.behavior,
    icon: preset.icon,
    legacyDayType: preset.legacyDayType,
    order: index,
    isPlaceholder: true as const,
  }));
}

export const listForCommunity = query({
  args: {
    communityId: v.id("communities"),
    /** Settings needs archived rows so they can be restored; pickers don't. */
    includeArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const community = await assertCanReadCommunity(ctx, args.communityId);
    if (!community) return [];
    const labels = await readLabels(ctx, args.communityId);
    if (args.includeArchived === true && labels.length > 0) {
      return labels;
    }
    return withFallbackDefaults(labels);
  },
});

/**
 * Every label the book's community has, archived included. Archiving only hides
 * a label from the pickers — days already assigned to it must keep resolving to
 * its name, or a schedule that said "Sabbath" would silently start saying
 * "Rest". Callers building a picker filter on `isArchived` themselves.
 */
export const listForCommunityBook = query({
  args: { communityBookId: v.id("communityBooks") },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.communityBookId);
    if (!book || book.isArchived === true) return [];
    const community = await assertCanReadCommunity(ctx, book.communityId);
    if (!community) return [];
    const labels = await readLabels(ctx, book.communityId);
    return labels.length > 0 ? labels : withFallbackDefaults(labels);
  },
});

export const createLabel = mutation({
  args: {
    communityId: v.id("communities"),
    name: v.string(),
    behavior: dayBehaviorValidator,
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager(ctx, args.communityId);
    const name = args.name.trim();
    if (name.length === 0) {
      throw new Error("Give the day label a name.");
    }

    const existing = await ensureDefaultLabels(ctx, args.communityId);
    if (
      existing.some(
        (label) =>
          label.isArchived !== true &&
          label.name.toLowerCase() === name.toLowerCase()
      )
    ) {
      throw new Error(`A day label called "${name}" already exists.`);
    }

    const now = Date.now();
    return await ctx.db.insert("communityDayLabels", {
      communityId: args.communityId,
      name,
      behavior: args.behavior,
      icon: args.icon,
      order: existing.reduce((max, label) => Math.max(max, label.order), -1) + 1,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Every community must keep at least one label members can be assigned work on. */
async function assertReadingLabelRemains(
  ctx: MutationCtx,
  communityId: Id<"communities">,
  changing: Id<"communityDayLabels">,
  next: { behavior?: DayBehavior; isArchived?: boolean }
) {
  const labels = await readLabels(ctx, communityId);
  const stillReading = labels.some((label) => {
    const behavior = label._id === changing ? next.behavior ?? label.behavior : label.behavior;
    const archived =
      label._id === changing ? next.isArchived ?? label.isArchived : label.isArchived;
    return behavior === "reading" && archived !== true;
  });
  if (!stillReading) {
    throw new Error(
      "Keep at least one reading day label — members need somewhere to be assigned reading."
    );
  }
}

export const updateLabel = mutation({
  args: {
    labelId: v.id("communityDayLabels"),
    name: v.optional(v.string()),
    behavior: v.optional(dayBehaviorValidator),
    icon: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const label = await ctx.db.get(args.labelId);
    if (!label) {
      throw new Error("Day label not found");
    }
    await requireCommunityManager(ctx, label.communityId);

    const name = args.name?.trim();
    if (args.name !== undefined && (!name || name.length === 0)) {
      throw new Error("Give the day label a name.");
    }
    if (args.behavior !== undefined) {
      await assertReadingLabelRemains(ctx, label.communityId, args.labelId, {
        behavior: args.behavior,
      });
    }

    await ctx.db.patch(args.labelId, {
      ...(name !== undefined ? { name } : {}),
      ...(args.behavior !== undefined ? { behavior: args.behavior } : {}),
      ...(args.icon !== undefined ? { icon: args.icon } : {}),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Archiving hides a label from the pickers but leaves schedule rows that
 * reference it fully resolvable — historical schedules never change meaning.
 */
export const archiveLabel = mutation({
  args: {
    labelId: v.id("communityDayLabels"),
    isArchived: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const label = await ctx.db.get(args.labelId);
    if (!label) {
      throw new Error("Day label not found");
    }
    await requireCommunityManager(ctx, label.communityId);
    const isArchived = args.isArchived ?? true;
    if (isArchived) {
      await assertReadingLabelRemains(ctx, label.communityId, args.labelId, {
        isArchived: true,
      });
    }
    await ctx.db.patch(args.labelId, { isArchived, updatedAt: Date.now() });
  },
});

export const reorderLabels = mutation({
  args: {
    communityId: v.id("communities"),
    labelIds: v.array(v.id("communityDayLabels")),
  },
  handler: async (ctx, args) => {
    await requireCommunityManager(ctx, args.communityId);
    const now = Date.now();
    for (const [index, labelId] of args.labelIds.entries()) {
      const label = await ctx.db.get(labelId);
      if (!label || label.communityId !== args.communityId) continue;
      await ctx.db.patch(labelId, { order: index, updatedAt: now });
    }
  },
});

/** Seeds a community's labels on demand from a client (settings page open). */
export const ensureLabelsForCommunity = mutation({
  args: { communityId: v.id("communities") },
  handler: async (ctx, args) => {
    await requireCommunityManager(ctx, args.communityId);
    await ensureDefaultLabels(ctx, args.communityId);
  },
});

/**
 * Same, but reachable by anyone who can edit the book's schedule — moderators
 * manage books without managing the community. The schedule editor needs real
 * label ids before it can save, and a community that predates day labels (or
 * whose labels were never touched) has none until something writes them.
 */
export const ensureLabelsForBook = mutation({
  args: { communityBookId: v.id("communityBooks") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const clerkId = identity?.subject;
    if (!clerkId) {
      throw new Error("Not authenticated");
    }
    const book = await ctx.db.get(args.communityBookId);
    if (!book || book.isArchived === true) {
      throw new Error("Community book not found");
    }
    const role = await getViewerRole(ctx, book.communityId, clerkId);
    if (!canManageBooks(role)) {
      throw new Error("Unauthorized");
    }
    await ensureDefaultLabels(ctx, book.communityId);
  },
});

/**
 * One-shot migration: stamps `dayLabelId` onto schedule rows that predate day
 * labels. Purely additive — `dayType` is left in place — and idempotent, so it
 * is safe to re-run or to abort partway. Nothing depends on it having run: the
 * resolver falls back to `dayType` either way.
 */
export const backfillScheduleDayLabels = internalMutation({
  args: {
    cursor: v.optional(v.union(v.string(), v.null())),
    batchSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const numItems = args.batchSize ?? 200;
    const page = await ctx.db
      .query("communityBookSchedule")
      .paginate({ cursor: args.cursor ?? null, numItems });

    // communityBookId -> legacyDayType -> labelId
    const labelCache = new Map<string, Map<string, Id<"communityDayLabels">>>();
    let updated = 0;
    let skipped = 0;

    for (const entry of page.page) {
      if (entry.dayLabelId) {
        skipped += 1;
        continue;
      }
      const legacy = entry.dayType;
      if (!legacy || !(legacy in LEGACY_DAY_TYPE_BEHAVIOR)) {
        skipped += 1;
        continue;
      }

      const bookKey = entry.communityBookId;
      let byLegacy = labelCache.get(bookKey);
      if (!byLegacy) {
        const book = await ctx.db.get(entry.communityBookId);
        if (!book) {
          skipped += 1;
          continue;
        }
        const labels = await ensureDefaultLabels(ctx, book.communityId);
        byLegacy = new Map(
          labels
            .filter((label) => label.legacyDayType !== undefined)
            .map((label) => [label.legacyDayType as string, label._id])
        );
        labelCache.set(bookKey, byLegacy);
      }

      const labelId = byLegacy.get(legacy);
      if (!labelId) {
        skipped += 1;
        continue;
      }
      await ctx.db.patch(entry._id, { dayLabelId: labelId });
      updated += 1;
    }

    return {
      updated,
      skipped,
      isDone: page.isDone,
      continueCursor: page.isDone ? null : page.continueCursor,
    };
  },
});
