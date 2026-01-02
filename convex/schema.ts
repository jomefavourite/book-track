import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  books: defineTable({
    userId: v.string(),
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
    createdAt: v.number(),
    bookOrder: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_order", ["userId", "bookOrder"]),

  readingSessions: defineTable({
    bookId: v.id("books"),
    userId: v.string(),
    date: v.string(),
    plannedPages: v.number(),
    actualPages: v.optional(v.number()),
    isRead: v.boolean(),
    createdAt: v.number(),
  })
    .index("by_book", ["bookId"])
    .index("by_book_and_date", ["bookId", "date"])
    .index("by_user", ["userId"]),
});

