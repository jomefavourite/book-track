import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

export const DEFAULT_REMINDER_TIME = "20:00";

const HHMM_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

function parseMinutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function getTodayAndCurrentMinutesInTz(timezone: string): {
  dateStr: string;
  minutesSinceMidnight: number;
} {
  const now = new Date();
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    dateStyle: "short",
  });
  const dateStr = dateFormatter.format(now);
  const timeFormatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const timeStr = timeFormatter.format(now);
  const [h, m] = timeStr.split(":").map(Number);
  return { dateStr, minutesSinceMidnight: h * 60 + m };
}

function isInReminderWindow(
  currentMinutes: number,
  reminderMinutes: number,
  windowMinutes: number = 15
): boolean {
  const windowStart = reminderMinutes;
  const windowEnd = reminderMinutes + windowMinutes - 1;
  return currentMinutes >= windowStart && currentMinutes <= windowEnd;
}

export const listUsersWithReminders = internalQuery({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").collect();
    return users.filter(
      (u) =>
        u.remindersEnabled !== false &&
        typeof u.timezone === "string" &&
        u.timezone.length > 0
    );
  },
});

export const getSessionsForUserAndDate = internalQuery({
  args: {
    clerkId: v.string(),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("readingSessions")
      .withIndex("by_user", (q) => q.eq("userId", args.clerkId))
      .collect()
      .then((sessions) => sessions.filter((s) => s.date === args.date));
  },
});

export const getPushSubscriptionForUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
  },
});

export const markReminderSent = internalMutation({
  args: {
    userId: v.id("users"),
    slot: v.union(v.literal(1), v.literal(2)),
    dateStr: v.string(),
  },
  handler: async (ctx, args) => {
    const patch =
      args.slot === 1
        ? { reminder1LastSentDate: args.dateStr }
        : { reminder2LastSentDate: args.dateStr };
    await ctx.db.patch(args.userId, patch);
  },
});

export const checkAndSendReminders = internalAction({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.runQuery(internal.reminders.listUsersWithReminders, {});
    const windowMinutes = 15;

    for (const user of users) {
      const timezone = user.timezone ?? "UTC";
      const { dateStr: todayStr, minutesSinceMidnight: currentMinutes } =
        getTodayAndCurrentMinutesInTz(timezone);

      const reminder1 =
        user.reminder1Time && HHMM_REGEX.test(user.reminder1Time)
          ? user.reminder1Time
          : DEFAULT_REMINDER_TIME;
      const reminder2 =
        user.reminder2Time && HHMM_REGEX.test(user.reminder2Time)
          ? user.reminder2Time
          : null;

      const reminder1Minutes = parseMinutesSinceMidnight(reminder1);
      const reminder2Minutes = reminder2
        ? parseMinutesSinceMidnight(reminder2)
        : null;

      const slotsDue: Array<1 | 2> = [];
      if (
        isInReminderWindow(currentMinutes, reminder1Minutes, windowMinutes) &&
        user.reminder1LastSentDate !== todayStr
      ) {
        slotsDue.push(1);
      }
      if (
        reminder2Minutes !== null &&
        isInReminderWindow(currentMinutes, reminder2Minutes, windowMinutes) &&
        user.reminder2LastSentDate !== todayStr
      ) {
        slotsDue.push(2);
      }

      for (const slot of slotsDue) {
        const hasUnread = await ctx.runQuery(
          internal.reminders.getSessionsForUserAndDate,
          { clerkId: user.clerkId, date: todayStr }
        ).then((sessions: Doc<"readingSessions">[]) =>
          sessions.some((s: Doc<"readingSessions">) => !s.isRead && !(s.isMissed ?? false))
        );
        if (!hasUnread) continue;

        const channel = user.reminderChannel ?? "push";
        const doPush =
          channel === "push" || channel === "both";
        const doEmail =
          channel === "email" || channel === "both";

        if (doPush) {
          const sub = await ctx.runQuery(
            internal.reminders.getPushSubscriptionForUser,
            { userId: user._id }
          );
          if (sub) {
            await ctx.runAction(internal.remindersSend.sendPushPayload, {
              endpoint: sub.endpoint,
              p256dh: sub.p256dh,
              auth: sub.auth,
            });
          }
        }
        if (doEmail && user.email) {
          await ctx.runAction(internal.remindersSend.sendEmailPayload, {
            email: user.email,
          });
        }

        await ctx.runMutation(internal.reminders.markReminderSent, {
          userId: user._id,
          slot,
          dateStr: todayStr,
        });
      }
    }
  },
});

const reminderChannelValidator = v.union(
  v.literal("push"),
  v.literal("email"),
  v.literal("both")
);

export const updateReminderSettings = mutation({
  args: {
    userId: v.string(),
    remindersEnabled: v.optional(v.boolean()),
    reminder1Time: v.optional(v.string()),
    reminder2Time: v.optional(v.union(v.string(), v.null())),
    reminderChannel: v.optional(reminderChannelValidator),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const clerkId = args.userId;
    if (!clerkId) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) throw new Error("User not found");

    if (args.reminder1Time !== undefined) {
      if (!HHMM_REGEX.test(args.reminder1Time)) {
        throw new Error("reminder1Time must be HH:mm (24h)");
      }
    }
    if (args.reminder2Time !== undefined && args.reminder2Time !== null) {
      if (!HHMM_REGEX.test(args.reminder2Time)) {
        throw new Error("reminder2Time must be HH:mm (24h)");
      }
    }
    if (args.timezone !== undefined && !args.timezone?.trim()) {
      throw new Error("timezone must be non-empty");
    }
    if (
      args.reminderChannel !== undefined &&
      !["push", "email", "both"].includes(args.reminderChannel)
    ) {
      throw new Error("reminderChannel must be push, email, or both");
    }

    const updates: {
      remindersEnabled?: boolean;
      reminder1Time?: string;
      reminder2Time?: string;
      reminderChannel?: "push" | "email" | "both";
      timezone?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.remindersEnabled !== undefined)
      updates.remindersEnabled = args.remindersEnabled;
    if (args.reminder1Time !== undefined) updates.reminder1Time = args.reminder1Time;
    if (args.reminder2Time !== undefined)
      updates.reminder2Time = args.reminder2Time ?? undefined;
    if (args.reminderChannel !== undefined)
      updates.reminderChannel = args.reminderChannel;
    if (args.timezone !== undefined) updates.timezone = args.timezone.trim();

    await ctx.db.patch(user._id, updates);
    return user._id;
  },
});

export const savePushSubscription = mutation({
  args: {
    userId: v.string(),
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  handler: async (ctx, args) => {
    if (!args.endpoint?.trim() || !args.p256dh?.trim() || !args.auth?.trim()) {
      throw new Error("endpoint, p256dh, and auth are required");
    }
    const clerkId = args.userId;
    if (!clerkId) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) throw new Error("User not found");
    const userId = user._id;
    const existing = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const now = Date.now();
    const payload = {
      userId,
      endpoint: args.endpoint.trim(),
      p256dh: args.p256dh.trim(),
      auth: args.auth.trim(),
      createdAt: now,
    };
    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }
    return await ctx.db.insert("pushSubscriptions", payload);
  },
});

export const getReminderSettings = query({
  args: { userId: v.string() },
  handler: async (ctx, args) => {
    const clerkId = args.userId;
    if (!clerkId) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return null;
    return {
      remindersEnabled: user.remindersEnabled ?? false,
      reminder1Time: user.reminder1Time ?? DEFAULT_REMINDER_TIME,
      reminder2Time: user.reminder2Time ?? null,
      reminderChannel: (user.reminderChannel ?? "push") as "push" | "email" | "both",
      timezone: user.timezone ?? null,
    };
  },
});
