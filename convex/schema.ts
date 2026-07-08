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
    reminder1ScheduledJobId: v.optional(v.string()),
    reminder2ScheduledJobId: v.optional(v.string()),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_slug", ["slug"]),

  books: defineTable({
    userId: v.string(),
    name: v.string(),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
    /** Max chapter selectable in chapter-based tracking mode */
    totalChapters: v.optional(v.number()),
    /** Default "pages" when omitted (legacy rows). "chapters" = also log chapter number per day */
    progressStyle: v.optional(
      v.union(v.literal("pages"), v.literal("chapters"))
    ),
    /** When true for chapter-based books, page totals and page-based tracking are ignored */
    ignorePages: v.optional(v.boolean()),
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
    /** Optional link where others can buy the book */
    buyLink: v.optional(v.string()),
    isArchived: v.optional(v.boolean()),
    /** Set when the user marks the book complete without day-by-day tracking */
    markedCompleteAt: v.optional(v.number()),
    /** Allows the public book page to show the generated merged reflection */
    shareMergedReflection: v.optional(v.boolean()),
    /** Set when this personal book was created by tracking a community book */
    communityBookId: v.optional(v.id("communityBooks")),
    /** Current reading cycle. Bumped on reset; sessions with a lower generation are stale. Absent ⇒ 0 */
    resetGeneration: v.optional(v.number()),
    /** Timestamp of the most recent reset */
    lastResetAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_user_and_order", ["userId", "bookOrder"])
    .index("by_public", ["isPublic"])
    .index("by_community_book_id", ["communityBookId"]),

  communities: defineTable({
    name: v.string(),
    slug: v.string(),
    description: v.optional(v.string()),
    visibility: v.union(v.literal("public"), v.literal("private")),
    joinPolicy: v.union(v.literal("invite_only")),
    /** Legacy current-read fields from the first community version. New books live in communityBooks. */
    currentBookTitle: v.optional(v.string()),
    currentBookAuthor: v.optional(v.string()),
    totalChapters: v.optional(v.number()),
    ownerClerkId: v.string(),
    ownerName: v.optional(v.string()),
    brandColor: v.optional(v.string()),
    instagramUrl: v.optional(v.string()),
    tiktokUrl: v.optional(v.string()),
    websiteUrl: v.optional(v.string()),
    logoStorageId: v.optional(v.id("_storage")),
    isArchived: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_visibility", ["visibility"]),

  communityBooks: defineTable({
    communityId: v.id("communities"),
    name: v.string(),
    author: v.optional(v.string()),
    totalPages: v.optional(v.number()),
    totalChapters: v.optional(v.number()),
    progressStyle: v.optional(
      v.union(v.literal("pages"), v.literal("chapters"))
    ),
    ignorePages: v.optional(v.boolean()),
    readingMode: v.union(v.literal("calendar"), v.literal("fixed-days")),
    startMonth: v.optional(v.string()),
    endMonth: v.optional(v.string()),
    startYear: v.optional(v.number()),
    endYear: v.optional(v.number()),
    daysToRead: v.optional(v.number()),
    startDate: v.string(),
    endDate: v.string(),
    createdByClerkId: v.string(),
    creatorName: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    isArchived: v.optional(v.boolean()),
    /** Library status; legacy rows without it are treated as "upcoming" */
    status: v.optional(
      v.union(
        v.literal("upcoming"),
        v.literal("active"),
        v.literal("completed")
      )
    ),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    coverImageStorageId: v.optional(v.id("_storage")),
  })
    .index("by_community", ["communityId"])
    .index("by_community_and_created", ["communityId", "createdAt"])
    .index("by_community_and_status", ["communityId", "status"]),

  communityBookSchedule: defineTable({
    communityBookId: v.id("communityBooks"),
    date: v.string(),
    dayType: v.union(
      v.literal("reading"),
      v.literal("rest"),
      v.literal("reflection"),
      v.literal("catchup")
    ),
    /** Chapter assigned for reading days on chapter-based books */
    chapterNumber: v.optional(v.number()),
    /** Pages assigned for reading days on page-based books */
    plannedPages: v.optional(v.number()),
    /** Short admin label shown to members, e.g. "Discuss ch. 1-2" */
    notes: v.optional(v.string()),
  })
    .index("by_community_book", ["communityBookId"])
    .index("by_community_book_and_date", ["communityBookId", "date"]),

  communityMembers: defineTable({
    communityId: v.id("communities"),
    clerkId: v.string(),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("moderator"),
      v.literal("member")
    ),
    status: v.union(v.literal("active"), v.literal("removed")),
    joinedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_community", ["communityId"])
    .index("by_clerk", ["clerkId"])
    .index("by_community_and_clerk", ["communityId", "clerkId"]),

  communityInvites: defineTable({
    communityId: v.id("communities"),
    token: v.string(),
    createdByClerkId: v.string(),
    roleToGrant: v.union(
      v.literal("admin"),
      v.literal("moderator"),
      v.literal("member")
    ),
    expiresAt: v.optional(v.number()),
    maxUses: v.optional(v.number()),
    usedCount: v.number(),
    disabledAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_token", ["token"])
    .index("by_community", ["communityId"]),

  communityCreatorGrants: defineTable({
    clerkId: v.string(),
    grantedBy: v.optional(v.string()),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  }).index("by_clerk_id", ["clerkId"]),

  communityCreatorRequests: defineTable({
    clerkId: v.string(),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    reason: v.optional(v.string()),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("rejected")
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_clerk_id", ["clerkId"])
    .index("by_status", ["status"]),

  readingSessions: defineTable({
    bookId: v.id("books"),
    userId: v.string(),
    date: v.string(),
    plannedPages: v.number(),
    actualPages: v.optional(v.number()),
    /** Page number the reader stopped on for this day; actualPages remains the daily delta */
    stopPage: v.optional(v.number()),
    /** Chapter read that day when book uses chapter-based reading; null clears */
    chapterNumber: v.optional(v.union(v.number(), v.null())),
    /**
     * Adaptive target chapter frozen when the day was marked read (chapter-only).
     * Keeps the Target label stable after mark; null clears on unmark.
     */
    targetChapter: v.optional(v.union(v.number(), v.null())),
    /** Owner-private note for a read day */
    reflectionNote: v.optional(v.string()),
    isRead: v.boolean(),
    isMissed: v.optional(v.boolean()),
    createdAt: v.number(),
    /** Reading cycle this session belongs to. Stale when < book.resetGeneration. Absent ⇒ 0 */
    resetGeneration: v.optional(v.number()),
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
