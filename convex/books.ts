import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createBook = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    author: v.optional(v.string()),
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
    isPublic: v.optional(v.boolean()),
    showCreatorName: v.optional(v.boolean()),
    showCreatorEmail: v.optional(v.boolean()),
    creatorName: v.optional(v.string()),
    creatorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const bookData: any = {
      userId,
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
      isPublic: args.isPublic ?? false,
      showCreatorName: args.showCreatorName ?? false,
      showCreatorEmail: args.showCreatorEmail ?? false,
      creatorName: args.creatorName,
      creatorEmail: args.creatorEmail,
      isArchived: false,
    };

    // Only include author if it's provided (not undefined)
    if (args.author !== undefined) {
      bookData.author = args.author;
    }

    console.log("Book data being inserted:", JSON.stringify(bookData, null, 2));

    const bookId = await ctx.db.insert("books", bookData);

    return bookId;
  },
});

export const getBooks = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Get only active (non-archived) books
    const allBooks = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const books = allBooks.filter((book) => !(book.isArchived ?? false));

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
  args: {
    bookId: v.id("books"),
    userId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      return null;
    }

    // If user is authenticated and owns the book, return it
    if (args.userId && book.userId === args.userId) {
      return book;
    }

    // If book is public, allow access (even without auth)
    if (book.isPublic) {
      // Return book with conditional creator info
      const result = { ...book };
      if (!book.showCreatorName) {
        result.creatorName = undefined;
      }
      if (!book.showCreatorEmail) {
        result.creatorEmail = undefined;
      }
      return result;
    }

    // If not owner and not public, unauthorized
    if (args.userId) {
      throw new Error("Unauthorized");
    }
    throw new Error("Not authenticated");
  },
});

export const updateBook = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
    name: v.optional(v.string()),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
    readingMode: v.optional(v.union(v.literal("calendar"), v.literal("fixed-days"))),
    startMonth: v.optional(v.string()),
    endMonth: v.optional(v.string()),
    startYear: v.optional(v.number()),
    endYear: v.optional(v.number()),
    daysToRead: v.optional(v.number()),
    startDate: v.optional(v.string()),
    endDate: v.optional(v.string()),
    isPublic: v.optional(v.boolean()),
    showCreatorName: v.optional(v.boolean()),
    showCreatorEmail: v.optional(v.boolean()),
    creatorName: v.optional(v.string()),
    creatorEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }

    // Ensure the book belongs to the authenticated user
    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const updates: {
      name?: string;
      author?: string;
      totalPages?: number;
      readingMode?: "calendar" | "fixed-days";
      startMonth?: string;
      endMonth?: string;
      startYear?: number;
      endYear?: number;
      daysToRead?: number;
      startDate?: string;
      endDate?: string;
      isPublic?: boolean;
      showCreatorName?: boolean;
      showCreatorEmail?: boolean;
      creatorName?: string;
      creatorEmail?: string;
    } = {};

    if (args.name !== undefined) {
      updates.name = args.name;
    }
    if (args.author !== undefined) {
      updates.author = args.author;
    }
    if (args.totalPages !== undefined) {
      updates.totalPages = args.totalPages;
    }
    if (args.readingMode !== undefined) {
      updates.readingMode = args.readingMode;
    }
    if (args.startMonth !== undefined) {
      updates.startMonth = args.startMonth;
    }
    if (args.endMonth !== undefined) {
      updates.endMonth = args.endMonth;
    }
    if (args.startYear !== undefined) {
      updates.startYear = args.startYear;
    }
    if (args.endYear !== undefined) {
      updates.endYear = args.endYear;
    }
    if (args.daysToRead !== undefined) {
      updates.daysToRead = args.daysToRead;
    }
    if (args.startDate !== undefined) {
      updates.startDate = args.startDate;
    }
    if (args.endDate !== undefined) {
      updates.endDate = args.endDate;
    }
    if (args.isPublic !== undefined) {
      updates.isPublic = args.isPublic;
    }
    if (args.showCreatorName !== undefined) {
      updates.showCreatorName = args.showCreatorName;
    }
    if (args.showCreatorEmail !== undefined) {
      updates.showCreatorEmail = args.showCreatorEmail;
    }
    if (args.creatorName !== undefined) {
      updates.creatorName = args.creatorName;
    }
    if (args.creatorEmail !== undefined) {
      updates.creatorEmail = args.creatorEmail;
    }

    await ctx.db.patch(args.bookId, updates);
  },
});

export const getArchivedBooks = query({
  args: {
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    // Get only archived books
    const allBooks = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();

    const books = allBooks.filter((book) => book.isArchived ?? false);

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

export const archiveBook = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }

    // Ensure the book belongs to the authenticated user
    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.bookId, { isArchived: true } as any);
  },
});

export const unarchiveBook = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }

    // Ensure the book belongs to the authenticated user
    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.bookId, { isArchived: false } as any);
  },
});

export const deleteBook = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }

    // Ensure the book belongs to the authenticated user
    if (book.userId !== userId) {
      throw new Error("Unauthorized");
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

export const getPublicBooks = query({
  handler: async (ctx) => {
    const allBooks = await ctx.db
      .query("books")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .order("desc")
      .collect();

    // Filter out archived books from public view
    const books = allBooks.filter((book) => !(book.isArchived ?? false));

    // Calculate progress and filter creator info based on visibility flags
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

        // Filter creator info based on visibility flags
        const result: typeof book & { progress: number } = {
          ...book,
          progress,
        };

        if (!book.showCreatorName) {
          result.creatorName = undefined;
        }
        if (!book.showCreatorEmail) {
          result.creatorEmail = undefined;
        }

        return result;
      })
    );

    return booksWithProgress;
  },
});

export const getPublicBook = query({
  args: {
    bookId: v.id("books"),
  },
  handler: async (ctx, args) => {
    const book = await ctx.db.get(args.bookId);
    if (!book) {
      return null;
    }

    // Only return if book is public
    if (!book.isPublic) {
      return null;
    }

    // Calculate progress
    const sessions = await ctx.db
      .query("readingSessions")
      .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
      .collect();

    const totalPagesRead = sessions.reduce((sum, session) => {
      if (session.isRead) {
        return sum + (session.actualPages || session.plannedPages);
      }
      return sum;
    }, 0);

    const progress = (totalPagesRead / book.totalPages) * 100;

    // Filter creator info based on visibility flags
    const result = {
      ...book,
      progress,
    };

    if (!book.showCreatorName) {
      result.creatorName = undefined;
    }
    if (!book.showCreatorEmail) {
      result.creatorEmail = undefined;
    }

    return result;
  },
});
