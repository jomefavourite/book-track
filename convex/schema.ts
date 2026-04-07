import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    imageUrl: v.optional(v.string()),
    slug: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
    // Reminder settings
    remindersEnabled: v.optional(v.boolean()),
    reminder1Time: v.optional(v.string()),
    reminder2Time: v.optional(v.string()),
    reminderChannel: v.optional(
      v.union(
        v.literal("push"),
        v.literal("email"),
        v.literal("both")
      )
    ),
    timezone: v.optional(v.string()),
    reminder1LastSentDate: v.optional(v.string()),
    reminder2LastSentDate: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_slug", ["slug"]),

  books: defineTable({
    userId: v.string(),
    name: v.string(),
    author: v.optional(v.string()),
    totalPages: v.number(),
    /** Default "pages" when omitted (legacy rows). "chapters" = also log chapter number per day */
    progressStyle: v.optional(
      v.union(v.literal("pages"), v.literal("chapters"))
    ),
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
    isPublic: v.boolean(),
    showCreatorName: v.optional(v.boolean()),
    showCreatorEmail: v.optional(v.boolean()),
    creatorName: v.optional(v.string()),
    creatorEmail: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
    /** Set when the user marks the book complete without day-by-day tracking */
    markedCompleteAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_order", ["userId", "bookOrder"])
    .index("by_public", ["isPublic"]),

  readingSessions: defineTable({
    bookId: v.id("books"),
    userId: v.string(),
    date: v.string(),
    plannedPages: v.number(),
    actualPages: v.optional(v.number()),
    /** Chapter read that day when book uses chapter-based reading; null clears */
    chapterNumber: v.optional(v.union(v.number(), v.null())),
    isRead: v.boolean(),
    isMissed: v.optional(v.boolean()),
    createdAt: v.number(),
    // Legacy timer fields (may exist on older documents)
    timerDurationSec: v.optional(v.number()),
    timerLastUpdatedAt: v.optional(v.number()),
    timerRemainingSec: v.optional(v.number()),
    timerStatus: v.optional(v.string()),
  })
    .index("by_book", ["bookId"])
    .index("by_book_and_date", ["bookId", "date"])
    .index("by_user", ["userId"]),

  pushSubscriptions: defineTable({
    userId: v.id("users"),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    createdAt: v.number(),
  }).index("by_user", ["userId"]),
});
