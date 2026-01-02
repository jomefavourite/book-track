import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { formatDateForStorage, parseDateFromStorage, distributePagesAcrossDays } from "./dateUtils";

export const createSession = mutation({
  args: {
    bookId: v.id("books"),
    date: v.string(),
    plannedPages: v.number(),
    actualPages: v.optional(v.number()),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    const sessionId = await ctx.db.insert("readingSessions", {
      bookId: args.bookId,
      userId: "local",
      date: args.date,
      plannedPages: args.plannedPages,
      actualPages: args.actualPages,
      isRead: args.isRead,
      createdAt: Date.now(),
    });

    return sessionId;
  },
});

export const initializeSessionsForBook = mutation({
  args: {
    bookId: v.id("books"),
    startDate: v.string(),
    endDate: v.string(),
    totalPages: v.number(),
  },
  handler: async (ctx, args) => {
    const start = parseDateFromStorage(args.startDate);
    const end = parseDateFromStorage(args.endDate);
    const distribution = distributePagesAcrossDays(args.totalPages, start, end);

    const sessionPromises = Array.from(distribution.entries()).map(([date, plannedPages]) =>
      ctx.db.insert("readingSessions", {
        bookId: args.bookId,
        userId: "local",
        date,
        plannedPages,
        isRead: false,
        createdAt: Date.now(),
      })
    );

    await Promise.all(sessionPromises);
  },
});

export const updateSession = mutation({
  args: {
    sessionId: v.id("readingSessions"),
    actualPages: v.optional(v.number()),
    isRead: v.boolean(),
  },
  handler: async (ctx, args) => {
    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    await ctx.db.patch(args.sessionId, {
      actualPages: args.actualPages,
      isRead: args.isRead,
    });
  },
});

export const getSessionsForBook = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("readingSessions")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .order("asc")
      .collect();
  },
});

export const getSessionsForDateRange = query({
  args: {
    bookId: v.id("books"),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();

    return sessions.filter(
      (session) =>
        session.date >= args.startDate && session.date <= args.endDate
    );
  },
});

export const getSessionByDate = query({
  args: {
    bookId: v.id("books"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();

    return sessions.find((session) => session.date === args.date) || null;
  },
});
