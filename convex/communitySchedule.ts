import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { canManageBooks } from "./communityRules";
import { canAccessCommunityBooks } from "./communityBookRules";

export const scheduleDayTypeValidator = v.union(
  v.literal("reading"),
  v.literal("rest"),
  v.literal("reflection"),
  v.literal("catchup")
);

const scheduleEntryValidator = v.object({
  date: v.string(),
  dayType: scheduleDayTypeValidator,
  chapterNumber: v.optional(v.number()),
  notes: v.optional(v.string()),
});

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
 * rest/reflection/catch-up days get 0 planned pages.
 */
export function buildSessionsFromSchedule(
  book: Pick<Doc<"books">, "totalPages" | "ignorePages">,
  schedule: Array<{
    date: string;
    dayType: "reading" | "rest" | "reflection" | "catchup";
    chapterNumber?: number;
  }>
) {
  const readingDays = schedule.filter((entry) => entry.dayType === "reading");
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
    if (entry.dayType === "reading") {
      plannedPages = perDay + (readingIndex < remainder ? 1 : 0);
      chapterNumber = entry.chapterNumber;
      readingIndex += 1;
    }
    return { date: entry.date, plannedPages, chapterNumber };
  });
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

export const upsertScheduleDay = mutation({
  args: {
    communityBookId: v.id("communityBooks"),
    date: v.string(),
    dayType: scheduleDayTypeValidator,
    chapterNumber: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireBookManager(ctx, args.communityBookId);

    const existing = await ctx.db
      .query("communityBookSchedule")
      .withIndex("by_community_book_and_date", (q) =>
        q.eq("communityBookId", args.communityBookId).eq("date", args.date)
      )
      .unique();

    const fields = {
      dayType: args.dayType,
      chapterNumber: args.dayType === "reading" ? args.chapterNumber : undefined,
      notes: args.notes?.trim() || undefined,
    };

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
    await requireBookManager(ctx, args.communityBookId);

    const seen = new Set<string>();
    for (const entry of args.entries) {
      if (seen.has(entry.date)) {
        throw new Error(`Duplicate schedule date: ${entry.date}`);
      }
      seen.add(entry.date);
    }

    const existing = await ctx.db
      .query("communityBookSchedule")
      .withIndex("by_community_book", (q) =>
        q.eq("communityBookId", args.communityBookId)
      )
      .collect();
    await Promise.all(existing.map((entry) => ctx.db.delete(entry._id)));

    await Promise.all(
      args.entries.map((entry) =>
        ctx.db.insert("communityBookSchedule", {
          communityBookId: args.communityBookId,
          date: entry.date,
          dayType: entry.dayType,
          chapterNumber:
            entry.dayType === "reading" ? entry.chapterNumber : undefined,
          notes: entry.notes?.trim() || undefined,
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

    const personalBooks = await ctx.db
      .query("books")
      .withIndex("by_community_book_id", (q) =>
        q.eq("communityBookId", args.communityBookId)
      )
      .collect();

    for (const personalBook of personalBooks) {
      const planned = buildSessionsFromSchedule(personalBook, schedule);
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
