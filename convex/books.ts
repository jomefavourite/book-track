import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
  parseDateFromStorage,
  formatDateForStorage,
  getAllDaysInRange,
  distributePagesAcrossDays,
  distributeChaptersAcrossDays,
} from "./dateUtils";
import {
  getBookProgressPercent,
  getEffectivePagesReadForStats,
} from "./bookProgress";

const isValidPositiveInteger = (value: number | undefined): value is number =>
  value !== undefined && Number.isInteger(value) && value > 0;

const isValidPositiveNumber = (value: number | undefined): value is number =>
  value !== undefined && Number.isFinite(value) && value > 0;

const isChapterOnlyTracking = (options: {
  progressStyle?: "pages" | "chapters";
  ignorePages?: boolean;
}) => options.progressStyle === "chapters" && options.ignorePages === true;

export const createBook = mutation({
  args: {
    userId: v.string(),
    name: v.string(),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
    totalChapters: v.optional(v.number()),
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
    buyLink: v.optional(v.string()),
    progressStyle: v.optional(
      v.union(v.literal("pages"), v.literal("chapters"))
    ),
    ignorePages: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = args.userId;
    if (!userId) {
      throw new Error("Not authenticated");
    }

    const progressStyle = args.progressStyle ?? "pages";
    const ignorePages = isChapterOnlyTracking({
      progressStyle,
      ignorePages: args.ignorePages,
    });

    if (progressStyle === "chapters" && !isValidPositiveInteger(args.totalChapters)) {
      throw new Error("Total chapters is required for chapter-based books");
    }
    if (!ignorePages && !isValidPositiveNumber(args.totalPages)) {
      throw new Error("Total pages is required unless pages are ignored");
    }

    const bookData: {
      userId: string;
      name: string;
      author?: string;
      totalPages?: number;
      totalChapters?: number;
      progressStyle: "pages" | "chapters";
      ignorePages: boolean;
      readingMode: "calendar" | "fixed-days";
      startMonth?: string;
      endMonth?: string;
      startYear?: number;
      endYear?: number;
      daysToRead?: number;
      startDate: string;
      endDate: string;
      createdAt: number;
      bookOrder?: number;
      isPublic: boolean;
      showCreatorName: boolean;
      showCreatorEmail: boolean;
      creatorName?: string;
      creatorEmail?: string;
      buyLink?: string;
      isArchived: boolean;
      shareMergedReflection: boolean;
    } = {
      userId,
      name: args.name,
      progressStyle,
      ignorePages,
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
      shareMergedReflection: false,
    };

    // Only include author if it's provided (not undefined)
    if (args.author !== undefined) {
      bookData.author = args.author;
    }

    // Only include buy link if it's provided (not undefined)
    if (args.buyLink !== undefined) {
      bookData.buyLink = args.buyLink;
    }

    if (bookData.progressStyle === "chapters") {
      bookData.totalChapters = args.totalChapters;
    }
    if (args.totalPages !== undefined) {
      bookData.totalPages = args.totalPages;
    }

    console.log("Book data being inserted:", JSON.stringify(bookData, null, 2));

    const bookId = await ctx.db.insert("books", bookData);

    return bookId;
  },
});

export const setMergedReflectionSharing = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
    shareMergedReflection: v.boolean(),
  },
  handler: async (ctx, args) => {
    if (!args.userId) {
      throw new Error("Not authenticated");
    }

    const book = await ctx.db.get(args.bookId);
    if (!book) {
      throw new Error("Book not found");
    }
    if (book.userId !== args.userId) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.bookId, {
      shareMergedReflection: args.shareMergedReflection,
    });
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

        const progress = getBookProgressPercent(book, sessions);

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

    // If not owner and not public, return null instead of throwing
    // This allows the frontend to handle the case gracefully
    // (e.g., show "private book" message instead of error)
    return null;
  },
});

export const updateBook = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
    name: v.optional(v.string()),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
    totalChapters: v.optional(v.number()),
    readingMode: v.optional(
      v.union(v.literal("calendar"), v.literal("fixed-days"))
    ),
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
    buyLink: v.optional(v.string()),
    progressStyle: v.optional(
      v.union(v.literal("pages"), v.literal("chapters"))
    ),
    ignorePages: v.optional(v.boolean()),
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
      totalChapters?: number;
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
      buyLink?: string;
      progressStyle?: "pages" | "chapters";
      ignorePages?: boolean;
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
    if (args.totalChapters !== undefined) {
      updates.totalChapters = args.totalChapters;
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
    if (args.buyLink !== undefined) {
      updates.buyLink = args.buyLink;
    }
    if (args.progressStyle !== undefined) {
      updates.progressStyle = args.progressStyle;
    }
    if (args.ignorePages !== undefined) {
      updates.ignorePages = args.ignorePages;
    }

    const finalProgressStyle = args.progressStyle ?? book.progressStyle ?? "pages";
    const finalIgnorePages = isChapterOnlyTracking({
      progressStyle: finalProgressStyle,
      ignorePages: args.ignorePages ?? book.ignorePages,
    });
    const finalTotalChapters = args.totalChapters ?? book.totalChapters;
    const finalTotalPages =
      args.totalPages ?? (finalIgnorePages ? book.totalPages : book.totalPages);

    if (finalProgressStyle === "chapters") {
      if (!isValidPositiveInteger(finalTotalChapters)) {
        throw new Error("Total chapters is required for chapter-based books");
      }
      updates.totalChapters = finalTotalChapters;
    } else {
      delete updates.totalChapters;
      updates.ignorePages = false;
    }

    if (!finalIgnorePages && !isValidPositiveNumber(finalTotalPages)) {
      throw new Error("Total pages is required unless pages are ignored");
    }

    // Determine the final values after update
    const finalStartDate = args.startDate ?? book.startDate;
    const finalEndDate = args.endDate ?? book.endDate;

    // Check if dates or totalPages have changed
    const datesChanged =
      args.startDate !== undefined || args.endDate !== undefined;
    const totalPagesChanged = args.totalPages !== undefined;
    const ignorePagesChanged = args.ignorePages !== undefined;

    const currentGeneration = book.resetGeneration ?? 0;

    // If dates or totalPages changed, update reading sessions
    if (datesChanged || totalPagesChanged || ignorePagesChanged) {
      // Get existing sessions for the active cycle only (stale sessions are frozen)
      const existingSessions = (
        await ctx.db
          .query("readingSessions")
          .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
          .collect()
      ).filter((s) => (s.resetGeneration ?? 0) === currentGeneration);

      const newStartDate = parseDateFromStorage(finalStartDate);
      const newEndDate = parseDateFromStorage(finalEndDate);
      const newDistribution =
        !finalIgnorePages && isValidPositiveNumber(finalTotalPages)
          ? distributePagesAcrossDays(finalTotalPages, newStartDate, newEndDate)
          : null;
      const chapterDistribution =
        finalIgnorePages && isValidPositiveInteger(finalTotalChapters)
          ? distributeChaptersAcrossDays(
              finalTotalChapters,
              newStartDate,
              newEndDate
            )
          : null;

      // Create a map of existing sessions by date
      const existingSessionsMap = new Map();
      existingSessions.forEach((session) => {
        existingSessionsMap.set(session.date, session);
      });

      // Get all days in the new date range
      const newDays = getAllDaysInRange(newStartDate, newEndDate);

      // Update or create sessions for each day in the new range
      for (const day of newDays) {
        const dateKey = formatDateForStorage(day);
        const newPlannedPages = newDistribution?.get(dateKey) ?? 0;
        const expectedChapterForDay = chapterDistribution?.get(dateKey);
        const existingSession = existingSessionsMap.get(dateKey);

        if (existingSession) {
          if (!finalIgnorePages && newDistribution) {
            // Update existing session's plannedPages, preserve isRead, isMissed, actualPages
            await ctx.db.patch(existingSession._id, {
              plannedPages: newPlannedPages,
            });
          } else if (
            chapterDistribution &&
            existingSession.chapterNumber != null &&
            expectedChapterForDay !== undefined &&
            existingSession.chapterNumber > expectedChapterForDay
          ) {
            await ctx.db.patch(existingSession._id, {
              chapterNumber: expectedChapterForDay,
            });
          }
        } else {
          // Create new session for this date
          await ctx.db.insert("readingSessions", {
            bookId: args.bookId,
            userId,
            date: dateKey,
            plannedPages: newPlannedPages,
            isRead: false,
            createdAt: Date.now(),
            resetGeneration: currentGeneration,
          });
        }
      }

      // Note: We preserve sessions outside the new date range
      // They won't be shown in the UI but won't be deleted
      // This preserves user data in case they change dates back
    }

    if (
      finalProgressStyle === "chapters" &&
      isValidPositiveInteger(finalTotalChapters)
    ) {
      const existingSessions = (
        await ctx.db
          .query("readingSessions")
          .withIndex("by_book", (q) => q.eq("bookId", args.bookId))
          .collect()
      ).filter((s) => (s.resetGeneration ?? 0) === currentGeneration);

      const shouldClamp =
        book.totalChapters === undefined || finalTotalChapters < book.totalChapters;

      if (shouldClamp) {
        for (const session of existingSessions) {
          if (
            session.chapterNumber !== undefined &&
            session.chapterNumber !== null &&
            session.chapterNumber > finalTotalChapters
          ) {
            await ctx.db.patch(session._id, {
              chapterNumber: finalTotalChapters,
            });
          }
        }
      }
    }

    await ctx.db.patch(args.bookId, updates);
  },
});

export const markBookCompleted = mutation({
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

    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (book.markedCompleteAt != null) {
      return;
    }

    await ctx.db.patch(args.bookId, { markedCompleteAt: Date.now() });
  },
});

export const clearMarkedComplete = mutation({
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

    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    if (book.markedCompleteAt == null) {
      return;
    }

    await ctx.db.patch(args.bookId, { markedCompleteAt: undefined });
  },
});

/**
 * Reset a book to start reading again from scratch. The current cycle's reading
 * sessions are preserved but become "stale" (frozen, read-only) by bumping the book's
 * resetGeneration. The book is collapsed to a single day (start = end = today) with no
 * active sessions, so progress reads 0. The client then sends the user to the edit page
 * to move the end date forward, which recreates fresh sessions for the new cycle.
 *
 * `startDate` is the client's local "today" (yyyy-MM-dd) to avoid server timezone drift.
 */
export const resetBook = mutation({
  args: {
    bookId: v.id("books"),
    userId: v.string(),
    startDate: v.string(),
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

    if (book.userId !== userId) {
      throw new Error("Unauthorized");
    }

    const newGeneration = (book.resetGeneration ?? 0) + 1;

    await ctx.db.patch(args.bookId, {
      resetGeneration: newGeneration,
      lastResetAt: Date.now(),
      markedCompleteAt: undefined,
      startDate: args.startDate,
      endDate: args.startDate,
    });
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

        const progress = getBookProgressPercent(book, sessions);

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

    await ctx.db.patch(args.bookId, { isArchived: true });
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

    await ctx.db.patch(args.bookId, { isArchived: false });
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

    // Include all public books (archived or not) so archived+public books still appear on public page
    const books = allBooks;

    // Calculate progress and filter creator info based on visibility flags
    const booksWithProgress = await Promise.all(
      books.map(async (book) => {
        const sessions = await ctx.db
          .query("readingSessions")
          .withIndex("by_book", (q) => q.eq("bookId", book._id))
          .collect();

        const progress = getBookProgressPercent(book, sessions);

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

export const getPublicBooksStats = query({
  handler: async (ctx) => {
    const allBooks = await ctx.db
      .query("books")
      .withIndex("by_public", (q) => q.eq("isPublic", true))
      .collect();

    // Include all public books (archived or not) so community stats reflect archived+public books
    const books = allBooks;

    let completed = 0;
    let inProgress = 0;
    let notStarted = 0;
    let totalPagesRead = 0;

    for (const book of books) {
      const sessions = await ctx.db
        .query("readingSessions")
        .withIndex("by_book", (q) => q.eq("bookId", book._id))
        .collect();

      const pagesRead = getEffectivePagesReadForStats(book, sessions);
      const progress = getBookProgressPercent(book, sessions);

      totalPagesRead += pagesRead;
      if (progress >= 100) completed += 1;
      else if (progress > 0) inProgress += 1;
      else notStarted += 1;
    }

    return {
      totalBooks: books.length,
      completed,
      inProgress,
      notStarted,
      totalPagesRead,
    };
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

    const progress = getBookProgressPercent(book, sessions);

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

export const getPublicBooksByUserId = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const allBooks = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();

    // Include all public books (archived or not)
    const books = allBooks.filter((book) => book.isPublic);

    const booksWithProgress = await Promise.all(
      books.map(async (book) => {
        const sessions = await ctx.db
          .query("readingSessions")
          .withIndex("by_book", (q) => q.eq("bookId", book._id))
          .collect();

        const progress = getBookProgressPercent(book, sessions);

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

export const getBooksForProfile = query({
  args: {
    profileUserId: v.string(),
    viewerUserId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const actualViewerId = identity?.subject ?? null;
    const isOwner =
      actualViewerId != null && actualViewerId === args.profileUserId;

    const allBooks = await ctx.db
      .query("books")
      .withIndex("by_user", (q) => q.eq("userId", args.profileUserId))
      .order("desc")
      .collect();

    // Owner sees all books (including archived). Others see all public books (including archived+public).
    const books = isOwner
      ? allBooks
      : allBooks.filter((book) => book.isPublic);

    if (!isOwner) {
      const publicOnly = books;
      const booksWithProgress = await Promise.all(
        publicOnly.map(async (book) => {
          const sessions = await ctx.db
            .query("readingSessions")
            .withIndex("by_book", (q) => q.eq("bookId", book._id))
            .collect();

          const progress = getBookProgressPercent(book, sessions);

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
    }

    const booksWithProgress = await Promise.all(
      books.map(async (book) => {
        const sessions = await ctx.db
          .query("readingSessions")
          .withIndex("by_book", (q) => q.eq("bookId", book._id))
          .collect();

        const progress = getBookProgressPercent(book, sessions);

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
