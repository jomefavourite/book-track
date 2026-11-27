import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { getClerkId, requireClerkId } from "./authHelpers";
import { getBookProgressPercent } from "./bookProgress";

const MAX_TITLE = 200;
const MAX_AUTHOR = 200;
const MAX_NOTE = 500;
const MIN_YEAR = 1900;
const MAX_YEAR = 2200;

function cleanText(value: string | undefined, max: number, field: string) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) {
    throw new ConvexError(`${field} must be ${max} characters or fewer.`);
  }
  return trimmed;
}

function validateYear(year: number) {
  if (!Number.isInteger(year) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new ConvexError("Pick a valid year.");
  }
}

function validateMonth(month: number | undefined | null) {
  if (month == null) return;
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new ConvexError("Pick a valid month.");
  }
}

function validatePages(pages: number | undefined | null) {
  if (pages == null) return;
  if (!Number.isInteger(pages) || pages <= 0 || pages > 100000) {
    throw new ConvexError("Pages must be a whole number above zero.");
  }
}

async function getOwnedPlan(
  ctx: MutationCtx,
  id: Id<"plannedBooks">,
  userId: string
) {
  const plan = await ctx.db.get(id);
  if (!plan || plan.userId !== userId) {
    throw new ConvexError("Planned book not found.");
  }
  return plan;
}

/** Only one book of the year per reader per year. */
async function clearBookOfTheYear(
  ctx: MutationCtx,
  userId: string,
  year: number,
  exceptId?: Id<"plannedBooks">
) {
  const plans = await ctx.db
    .query("plannedBooks")
    .withIndex("by_user_and_year", (q) =>
      q.eq("userId", userId).eq("year", year)
    )
    .collect();
  for (const plan of plans) {
    if (plan.isBookOfTheYear && plan._id !== exceptId) {
      await ctx.db.patch(plan._id, { isBookOfTheYear: false });
    }
  }
}

export type PlanStatus = "planned" | "reading" | "finished";

/**
 * A reader's plan across all years. The owner sees everything; visitors see
 * only items marked public, and only get a link to the tracked book when that
 * book is itself public.
 */
export const getReadingPlan = query({
  args: { profileUserId: v.string() },
  handler: async (ctx, args) => {
    const viewerId = await getClerkId(ctx);
    const isOwner = viewerId != null && viewerId === args.profileUserId;

    const plans = await ctx.db
      .query("plannedBooks")
      .withIndex("by_user", (q) => q.eq("userId", args.profileUserId))
      .collect();
    const visible = isOwner ? plans : plans.filter((plan) => plan.isPublic);

    const items = await Promise.all(
      visible.map(async (plan) => {
        let status: PlanStatus = "planned";
        let progress = 0;
        let linkedBookId: Id<"books"> | null = null;

        const book: Doc<"books"> | null = plan.bookId
          ? await ctx.db.get(plan.bookId)
          : null;
        // A deleted (or foreign) book just falls back to "planned". So does a
        // private book for anyone but the owner: a public plan entry must not
        // reveal the progress of a book the reader keeps private.
        const ownBook = book !== null && book.userId === plan.userId;
        if (ownBook && (isOwner || book.isPublic)) {
          const sessions = await ctx.db
            .query("readingSessions")
            .withIndex("by_book", (q) => q.eq("bookId", book._id))
            .collect();
          progress = Math.round(getBookProgressPercent(book, sessions));
          // Tracked but nothing logged yet still reads as "planned".
          status =
            progress >= 100 ? "finished" : progress > 0 ? "reading" : "planned";
          linkedBookId = book._id;
        }

        return {
          _id: plan._id,
          year: plan.year,
          month: plan.month ?? null,
          title: plan.title,
          author: plan.author ?? null,
          totalPages: plan.totalPages ?? null,
          note: plan.note ?? null,
          isPublic: plan.isPublic,
          isBookOfTheYear: plan.isBookOfTheYear === true,
          createdAt: plan.createdAt,
          status,
          progress,
          bookId: linkedBookId,
          isTracked: linkedBookId !== null,
        };
      })
    );

    return items.sort(
      (a, b) =>
        a.year - b.year ||
        (a.month ?? 0) - (b.month ?? 0) ||
        a.createdAt - b.createdAt
    );
  },
});

/** The caller's own planned book — used to prefill "Start tracking". */
export const getPlannedBook = query({
  // A plain string: it comes from a URL (?plan=), so tolerate junk values.
  args: { id: v.string() },
  handler: async (ctx, args) => {
    const userId = await getClerkId(ctx);
    if (!userId) return null;
    const id = ctx.db.normalizeId("plannedBooks", args.id);
    if (!id) return null;
    const plan = await ctx.db.get(id);
    if (!plan || plan.userId !== userId) return null;
    return plan;
  },
});

export const addPlannedBook = mutation({
  args: {
    year: v.number(),
    month: v.optional(v.number()),
    title: v.string(),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
    note: v.optional(v.string()),
    isPublic: v.boolean(),
    isBookOfTheYear: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireClerkId(ctx);
    validateYear(args.year);
    validateMonth(args.month);
    validatePages(args.totalPages);
    const title = cleanText(args.title, MAX_TITLE, "Title");
    if (!title) throw new ConvexError("Add a title.");

    if (args.isBookOfTheYear) {
      await clearBookOfTheYear(ctx, userId, args.year);
    }

    const now = Date.now();
    return await ctx.db.insert("plannedBooks", {
      userId,
      year: args.year,
      month: args.month,
      title,
      author: cleanText(args.author, MAX_AUTHOR, "Author"),
      totalPages: args.totalPages,
      note: cleanText(args.note, MAX_NOTE, "Note"),
      isPublic: args.isPublic,
      isBookOfTheYear: args.isBookOfTheYear === true,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const updatePlannedBook = mutation({
  args: {
    id: v.id("plannedBooks"),
    year: v.number(),
    month: v.union(v.number(), v.null()),
    title: v.string(),
    author: v.union(v.string(), v.null()),
    totalPages: v.union(v.number(), v.null()),
    note: v.union(v.string(), v.null()),
    isPublic: v.boolean(),
    isBookOfTheYear: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await requireClerkId(ctx);
    await getOwnedPlan(ctx, args.id, userId);
    validateYear(args.year);
    validateMonth(args.month);
    validatePages(args.totalPages);
    const title = cleanText(args.title, MAX_TITLE, "Title");
    if (!title) throw new ConvexError("Add a title.");

    if (args.isBookOfTheYear) {
      await clearBookOfTheYear(ctx, userId, args.year, args.id);
    }

    await ctx.db.patch(args.id, {
      year: args.year,
      month: args.month ?? undefined,
      title,
      author: cleanText(args.author ?? undefined, MAX_AUTHOR, "Author"),
      totalPages: args.totalPages ?? undefined,
      note: cleanText(args.note ?? undefined, MAX_NOTE, "Note"),
      isPublic: args.isPublic,
      isBookOfTheYear: args.isBookOfTheYear,
      updatedAt: Date.now(),
    });
  },
});

export const setBookOfTheYear = mutation({
  args: { id: v.id("plannedBooks"), value: v.boolean() },
  handler: async (ctx, args) => {
    const userId = await requireClerkId(ctx);
    const plan = await getOwnedPlan(ctx, args.id, userId);
    if (args.value) {
      await clearBookOfTheYear(ctx, userId, plan.year, plan._id);
    }
    await ctx.db.patch(plan._id, {
      isBookOfTheYear: args.value,
      updatedAt: Date.now(),
    });
  },
});

export const deletePlannedBook = mutation({
  args: { id: v.id("plannedBooks") },
  handler: async (ctx, args) => {
    const userId = await requireClerkId(ctx);
    await getOwnedPlan(ctx, args.id, userId);
    await ctx.db.delete(args.id);
  },
});

/** Called after "Start tracking" creates a book from a planned one. */
export const linkPlannedBook = mutation({
  args: { id: v.id("plannedBooks"), bookId: v.id("books") },
  handler: async (ctx, args) => {
    const userId = await requireClerkId(ctx);
    await getOwnedPlan(ctx, args.id, userId);
    const book = await ctx.db.get(args.bookId);
    if (!book || book.userId !== userId) {
      throw new ConvexError("Book not found.");
    }
    await ctx.db.patch(args.id, { bookId: args.bookId, updatedAt: Date.now() });
  },
});
