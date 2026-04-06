import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  formatDateForStorage,
  parseDateFromStorage,
  distributePagesAcrossDays,
} from "./dateUtils";

export const createSession = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
    date: v.string(),
    plannedPages: v.number(),
    actualPages: v.optional(v.number()),
    isRead: v.boolean(),
    isMissed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify the book belongs to the user
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }
    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    // Ensure isRead and isMissed are mutually exclusive
    const isRead = args.isMissed ? false : args.isRead;
    const isMissed = args.isRead ? false : (args.isMissed ?? false);

    const sessionId = await ctx.db.insert("readingSessions", {
      bookId: args.bookId,
      userId,
      date: args.date,
      plannedPages: args.plannedPages,
      actualPages: args.actualPages,
      isRead,
      isMissed,
      createdAt: Date.now(),
    });

    return sessionId;
  },
});

export const initializeSessionsForBook = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
    totalPages: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify the book belongs to the user
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }
    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const start = parseDateFromStorage(args.startDate);
    const end = parseDateFromStorage(args.endDate);
    const distribution = distributePagesAcrossDays(args.totalPages, start, end);

    const sessionPromises = Array.from(distribution.entries()).map(
      ([date, plannedPages]) =>
      ctx.db.insert("readingSessions", {
        bookId: args.bookId,
          userId,
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
    userId: v.string(),
    actualPages: v.optional(v.number()),
    plannedPages: v.optional(v.number()),
    isRead: v.optional(v.boolean()),
    isMissed: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const session = await ctx.db.get(args.sessionId);
    if (!session) {
      throw new Error("Session not found");
    }

    // Verify the session belongs to the user
    if (session.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const updateData: {
      actualPages?: number;
      plannedPages?: number;
      isRead?: boolean;
      isMissed?: boolean;
    } = {};

    if (args.actualPages !== undefined) {
      updateData.actualPages = args.actualPages;
    }

    if (args.plannedPages !== undefined) {
      updateData.plannedPages = args.plannedPages;
    }

    // Handle isRead and isMissed - ensure they're mutually exclusive
    if (args.isRead !== undefined) {
      updateData.isRead = args.isRead;
      // If marking as read, ensure isMissed is false
      if (args.isRead) {
        updateData.isMissed = false;
      }
    }

    if (args.isMissed !== undefined) {
      updateData.isMissed = args.isMissed;
      // If marking as missed, ensure isRead is false
      if (args.isMissed) {
        updateData.isRead = false;
      }
    }

    await ctx.db.patch(args.sessionId, updateData);
  },
});

export const getSessionsForBook = query({
  args: {
    bookId: v.id("books"),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }

    // If user is authenticated and owns the book, allow access
    if (args.userId && book.userId === args.userId) {
      return await ctx.db
        .query("readingSessions")
        .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
        .order("asc")
        .collect();
    }

    // If book is public, allow read-only access (even without auth)
    if (book.isPublic) {
    return await ctx.db
      .query("readingSessions")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .order("asc")
      .collect();
    }

    // If not owner and not public, unauthorized
    if (args.userId) {
      throw new Error("Unauthorized");
    }
    throw new Error("Not authenticated");
  },
});

export const getSessionsForDateRange = query({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
    startDate: v.string(),
    endDate: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify the book belongs to the user
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }
    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

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
    userId: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Verify the book belongs to the user
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }
    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();

    return sessions.find((session) => session.date === args.date) || null;
  },
});
