import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createBook = mutation({
  args: {
    name: v.string(),
    totalPages: v.number(),
    readingMode: v.union(v.literal("calendar"), v.literal("fixed-days")),
    startMonth: v.optional(v.string()),
    endMonth: v.optional(v.string()),
    startYear: v.optional(v.number()),
    endYear: v.optional(v.number()),
    daysToRead: v.optional(v.number()),
    startDate: v.string(),
    endDate: v.string(),
    bookOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const bookId = await ctx.db.insert("books", {
      userId: "local",
      name: args.name,
      totalPages: args.totalPages,
      readingMode: args.readingMode,
      startMonth: args.startMonth,
      endMonth: args.endMonth,
      startYear: args.startYear,
      endYear: args.endYear,
      daysToRead: args.daysToRead,
      startDate: args.startDate,
      endDate: args.endDate,
      createdAt: Date.now(),
      bookOrder: args.bookOrder,
    });

    return bookId;
  },
});

export const getBooks = query({
  handler: async (ctx) => {
    const books = await ctx.db
      .query("books")
      .order("desc")
      .collect();

    // Calculate progress for each book
    const booksWithProgress = await Promise.all(
      books.map(async (book) => {
        const sessions = await ctx.db
          .query("readingSessions")
          .withIndex("by_book", (q) => q.eq("bookId", book._id))
          .collect();

        const totalPagesRead = sessions.reduce((sum, session) => {
          if (session.isRead) {
            return sum + (session.actualPages || session.plannedPages);
          }
          return sum;
        }, 0);

        const progress = (totalPagesRead / book.totalPages) * 100;

        return {
          ...book,
          progress,
        };
      })
    );

    return booksWithProgress;
  },
});

export const getBook = query({
  args: { bookId: v.id("books") },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.bookId);
    return book;
  },
});

export const updateBook = mutation({
  args: {
    bookId: v.id("books"),
    name: v.optional(v.string()),
    totalPages: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }

    const updates: {
      name?: string;
      totalPages?: number;
    } = {};

    if (args.name !== undefined) {
      updates.name = args.name;
    }
    if (args.totalPages !== undefined) {
      updates.totalPages = args.totalPages;
    }

    await ctx.db.patch(args.bookId, updates);
  },
});

export const deleteBook = mutation({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }

    // Delete all reading sessions associated with this book
    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();

    for (const session of sessions) {
      await ctx.db.delete(session._id);
    }

    // Delete the book
    await ctx.db.delete(args.bookId);
  },
});
