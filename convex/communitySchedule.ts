import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { canManageBooks } from "./communityRules";
import { canAccessCommunityBooks } from "./communityBookRules";
import {
  BEHAVIOR_LEGACY_DAY_TYPE,
  LEGACY_DAY_TYPE_BEHAVIOR,
  behaviorAssignsTarget,
  legacyDayTypeValidator,
  type DayBehavior,
} from "./dayBehavior";

/** @deprecated Kept for legacy callers; day labels are the source of truth. */
export const scheduleDayTypeValidator = legacyDayTypeValidator;

const scheduleEntryValidator = v.object({
  date: v.string(),
  dayLabelId: v.id("communityDayLabels"),
  chapterNumber: v.optional(v.number()),
  plannedPages: v.optional(v.number()),
  notes: v.optional(v.string()),
});

type ScheduleEntryLike = {
  dayLabelId?: Id<"communityDayLabels">;
  dayType?: string;
};

/**
 * Resolves what a schedule day is for. `dayLabelId` wins; rows written before
 * day labels existed fall back to their legacy `dayType`, so schedules stay
 * correct whether or not `backfillScheduleDayLabels` has run. Anything
 * unrecognised is treated as a reading day — the app's pre-existing assumption.
 */
export function resolveEntryBehavior(
  entry: ScheduleEntryLike | undefined,
  labelsById: Map<string, { behavior: DayBehavior; name: string }>
): { behavior: DayBehavior; name: string } {
  if (entry?.dayLabelId) {
    const label = labelsById.get(entry.dayLabelId);
    if (label) return label;
  }
  const legacy = entry?.dayType;
  if (legacy && legacy in LEGACY_DAY_TYPE_BEHAVIOR) {
    return { behavior: LEGACY_DAY_TYPE_BEHAVIOR[legacy], name: legacy };
  }
  return { behavior: "reading", name: "Reading" };
}

async function getLabelsById(
  ctx: QueryCtx | MutationCtx,
  communityId: Id<"communities">
) {
  const labels = await ctx.db
    .query("communityDayLabels")
    .withIndex("by_community", (q) => q.eq("communityId", communityId))
    .collect();
  return new Map(
    labels.map((label) => [
      label._id as string,
      { behavior: label.behavior as DayBehavior, name: label.name },
    ])
  );
}

async function requireClerkId(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  const clerkId = identity?.subject;
  if (!clerkId) {
    throw new Error("Not authenticated");
  }
  return clerkId;
}

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

async function requireBookManager(
  ctx: MutationCtx,
  communityBookId: Id<"communityBooks">
) {
  const clerkId = await requireClerkId(ctx);
  const book = await ctx.db.get(communityBookId);
  if (!book || book.isArchived === true) {
    throw new Error("Community book not found");
  }
  const role = await getViewerRole(ctx, book.communityId, clerkId);
  if (!canManageBooks(role)) {
    throw new Error("Unauthorized");
  }
  return book;
}

/**
 * Builds readingSessions insert payloads for a personal book from a community
 * schedule. Total pages are spread evenly across the schedule's reading days;
 * days whose label is flexible or off get 0 planned pages.
 */
export function buildSessionsFromSchedule(
  book: Pick<Doc<"books">, "totalPages" | "ignorePages">,
  schedule: Array<{
    date: string;
    dayLabelId?: Id<"communityDayLabels">;
    dayType?: string;
    chapterNumber?: number;
    plannedPages?: number;
  }>,
  labelsById: Map<string, { behavior: DayBehavior; name: string }>
) {
  const assignsTarget = (entry: (typeof schedule)[number]) =>
    behaviorAssignsTarget(resolveEntryBehavior(entry, labelsById).behavior);

  const readingDays = schedule.filter(assignsTarget);
  const totalPages =
    book.ignorePages === true ? 0 : book.totalPages ?? 0;
  const perDay =
    readingDays.length > 0 ? Math.floor(totalPages / readingDays.length) : 0;
  const remainder =
    readingDays.length > 0 ? totalPages % readingDays.length : 0;

  let readingIndex = 0;
  return schedule.map((entry) => {
    let plannedPages = 0;
    let chapterNumber: number | undefined;
    if (assignsTarget(entry)) {
      // Honor the manager-configured per-day target; fall back to an even
      // split for legacy schedules and days without an explicit amount.
      const evenSplit = perDay + (readingIndex < remainder ? 1 : 0);
      plannedPages = entry.plannedPages ?? evenSplit;
      chapterNumber = entry.chapterNumber;
      readingIndex += 1;
    }
    return { date: entry.date, plannedPages, chapterNumber };
  });
}

/**
 * What a given day of a community book is for, resolved through the community's
 * own day labels. Returns undefined when the schedule has no entry for the date.
 */
export async function getScheduleDayBehaviorForDate(
  ctx: QueryCtx | MutationCtx,
  communityBookId: Id<"communityBooks">,
  date: string
): Promise<{ behavior: DayBehavior; name: string } | undefined> {
  const entry = await ctx.db
    .query("communityBookSchedule")
    .withIndex("by_community_book_and_date", (q) =>
      q.eq("communityBookId", communityBookId).eq("date", date)
    )
    .unique();
  if (!entry) return undefined;

  const book = await ctx.db.get(communityBookId);
  if (!book) return undefined;
  const labelsById = await getLabelsById(ctx, book.communityId);
  return resolveEntryBehavior(entry, labelsById);
}

export async function getScheduleEntries(
  ctx: QueryCtx | MutationCtx,
  communityBookId: Id<"communityBooks">
) {
  const entries = await ctx.db
    .query("communityBookSchedule")
    .withIndex("by_community_book", (q) =>
      q.eq("communityBookId", communityBookId)
    )
    .collect();
  return entries.sort((a, b) => a.date.localeCompare(b.date));
}

export const getScheduleForBook = query({
  args: {
    communityBookId: v.id("communityBooks"),
  },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.communityBookId);
    if (!book || book.isArchived === true) {
      return [];
    }
    const community = await ctx.db.get(book.communityId);
    if (!community || community.isArchived === true) {
      return [];
    }

    const identity = await ctx.auth.getUserIdentity();
    const viewerRole = await getViewerRole(
      ctx,
      book.communityId,
      identity?.subject
    );
    if (
      !canAccessCommunityBooks({
        visibility: community.visibility,
        isMember: viewerRole !== undefined,
      })
    ) {
      throw new Error("Unauthorized");
    }

    return await getScheduleEntries(ctx, args.communityBookId);
  },
});

/**
 * Validates a label belongs to the book's community and returns the fields to
 * persist. `dayType` is shadow-written with the legacy equivalent of the
 * label's behavior purely for rollback safety — nothing reads it while
 * `dayLabelId` is present.
 */
async function buildDayFields(
  ctx: MutationCtx,
  book: Doc<"communityBooks">,
  input: {
    dayLabelId: Id<"communityDayLabels">;
    chapterNumber?: number;
    plannedPages?: number;
    notes?: string;
  }
) {
  const label = await ctx.db.get(input.dayLabelId);
  if (!label || label.communityId !== book.communityId) {
    throw new Error("Unknown day label for this community");
  }
  const assignsTarget = behaviorAssignsTarget(label.behavior);
  return {
    dayLabelId: input.dayLabelId,
    dayType: BEHAVIOR_LEGACY_DAY_TYPE[label.behavior],
    chapterNumber: assignsTarget ? input.chapterNumber : undefined,
    plannedPages: assignsTarget ? input.plannedPages : undefined,
    notes: input.notes?.trim() || undefined,
  };
}

export const upsertScheduleDay = mutation({
  args: {
    communityBookId: v.id("communityBooks"),
    date: v.string(),
    dayLabelId: v.id("communityDayLabels"),
    chapterNumber: v.optional(v.number()),
    plannedPages: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const book = await requireBookManager(ctx, args.communityBookId);

    const existing = await ctx.db
      .query("communityBookSchedule")
      .withIndex("by_community_book_and_date", (q) =>
        q.eq("communityBookId", args.communityBookId).eq("date", args.date)
      )
      .unique();

    const fields = await buildDayFields(ctx, book, args);

    if (existing) {
      await ctx.db.patch(existing._id, fields);
    } else {
      await ctx.db.insert("communityBookSchedule", {
        communityBookId: args.communityBookId,
        date: args.date,
        ...fields,
      });
    }

    await ctx.scheduler.runAfter(
      0,
      internal.communitySchedule.syncSessionsToSchedule,
      { communityBookId: args.communityBookId }
    );
  },
});

export const deleteScheduleDay = mutation({
  args: {
    scheduleEntryId: v.id("communityBookSchedule"),
  },
  handler: async (ctx, args) => {
    const entry = await ctx.db.get(args.scheduleEntryId);
    if (!entry) {
      throw new Error("Schedule entry not found");
    }
    await requireBookManager(ctx, entry.communityBookId);
    await ctx.db.delete(args.scheduleEntryId);

    await ctx.scheduler.runAfter(
      0,
      internal.communitySchedule.syncSessionsToSchedule,
      { communityBookId: entry.communityBookId }
    );
  },
});

export const bulkReplaceSchedule = mutation({
  args: {
    communityBookId: v.id("communityBooks"),
    entries: v.array(scheduleEntryValidator),
  },
  handler: async (ctx, args) => {
    const book = await requireBookManager(ctx, args.communityBookId);

    const seen = new Set<string>();
    for (const entry of args.entries) {
      if (seen.has(entry.date)) {
        throw new Error(`Duplicate schedule date: ${entry.date}`);
      }
      seen.add(entry.date);
    }

    // Resolve every label before deleting anything, so an invalid label can't
    // leave the book with a half-written schedule.
    const prepared = await Promise.all(
      args.entries.map(async (entry) => ({
        date: entry.date,
        ...(await buildDayFields(ctx, book, entry)),
      }))
    );

    const existing = await ctx.db
      .query("communityBookSchedule")
      .withIndex("by_community_book", (q) =>
        q.eq("communityBookId", args.communityBookId)
      )
      .collect();
    await Promise.all(existing.map((entry) => ctx.db.delete(entry._id)));

    await Promise.all(
      prepared.map((entry) =>
        ctx.db.insert("communityBookSchedule", {
          communityBookId: args.communityBookId,
          ...entry,
        })
      )
    );

    await ctx.scheduler.runAfter(
      0,
      internal.communitySchedule.syncSessionsToSchedule,
      { communityBookId: args.communityBookId }
    );
  },
});

/**
 * Re-aligns the personal reading sessions of every member tracking a
 * community book with its (edited) schedule. Sessions with logged activity
 * (read, missed, pages, or a reflection note) are never modified or deleted.
 */
export const syncSessionsToSchedule = internalMutation({
  args: {
    communityBookId: v.id("communityBooks"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const schedule = await getScheduleEntries(ctx, args.communityBookId);
    const communityBook = await ctx.db.get(args.communityBookId);
    if (!communityBook) return null;
    const labelsById = await getLabelsById(ctx, communityBook.communityId);

    const personalBooks = await ctx.db
      .query("books")
      .withIndex("by_community_book_id", (q) =>
        q.eq("communityBookId", args.communityBookId)
      )
      .collect();

    for (const personalBook of personalBooks) {
      const planned = buildSessionsFromSchedule(
        personalBook,
        schedule,
        labelsById
      );
      const plannedByDate = new Map(planned.map((p) => [p.date, p]));

      const sessions = await ctx.db
        .query("readingSessions")
        .withIndex("by_book", (q) => q.eq("bookId", personalBook._id))
        .collect();

      const sessionsByDate = new Map(sessions.map((s) => [s.date, s]));

      for (const session of sessions) {
        const hasLoggedActivity =
          session.isRead ||
          session.isMissed === true ||
          session.actualPages !== undefined ||
          session.stopPage !== undefined ||
          (typeof session.reflectionNote === "string" &&
            session.reflectionNote.trim().length > 0);
        if (hasLoggedActivity) continue;

        const plannedDay = plannedByDate.get(session.date);
        if (plannedDay) {
          await ctx.db.patch(session._id, {
            plannedPages: plannedDay.plannedPages,
            chapterNumber: plannedDay.chapterNumber ?? null,
          });
        } else {
          await ctx.db.delete(session._id);
        }
      }

      for (const plannedDay of planned) {
        if (sessionsByDate.has(plannedDay.date)) continue;
        await ctx.db.insert("readingSessions", {
          bookId: personalBook._id,
          userId: personalBook.userId,
          date: plannedDay.date,
          plannedPages: plannedDay.plannedPages,
          chapterNumber: plannedDay.chapterNumber,
          isRead: false,
          createdAt: Date.now(),
        });
      }
    }

    return null;
  },
});
