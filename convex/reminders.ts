import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";

export const DEFAULT_REMINDER_TIME = "20:00";
const REMINDER_WINDOW_MINUTES = 2;

const HHMM_REGEX = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
type ReminderSlot = 1 | 2;

function parseMinutesSinceMidnight(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

function getZonedDateParts(
  date: Date,
  timezone: string
): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function getTimeZoneOffsetMs(date: Date, timezone: string): number {
  const parts = getZonedDateParts(date, timezone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );
  return asUtc - date.getTime();
}

function getUtcTimestampForTimeZone(
  timezone: string,
  parts: {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second?: number;
  }
): number {
  const utcGuess = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second ?? 0
  );
  const offset = getTimeZoneOffsetMs(new Date(utcGuess), timezone);
  return utcGuess - offset;
}

function getNextReminderRunAt(timezone: string, hhmm: string): number {
  const now = new Date();
  const nowParts = getZonedDateParts(now, timezone);
  const [targetHour, targetMinute] = hhmm.split(":").map(Number);

  const targetDate = new Date(
    Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day)
  );

  if (
    nowParts.hour > targetHour ||
    (nowParts.hour === targetHour && nowParts.minute >= targetMinute)
  ) {
    targetDate.setUTCDate(targetDate.getUTCDate() + 1);
  }

  return getUtcTimestampForTimeZone(timezone, {
    year: targetDate.getUTCFullYear(),
    month: targetDate.getUTCMonth() + 1,
    day: targetDate.getUTCDate(),
    hour: targetHour,
    minute: targetMinute,
    second: 0,
  });
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
  windowMinutes: number = 1
): boolean {
  const windowStart = reminderMinutes;
  const windowEnd = reminderMinutes + windowMinutes - 1;
  return currentMinutes >= windowStart && currentMinutes <= windowEnd;
}

function getReminderTimeForSlot(user: Doc<"users">, slot: ReminderSlot): string | null {
  if (slot === 1) {
    return user.reminder1Time && HHMM_REGEX.test(user.reminder1Time)
      ? user.reminder1Time
      : DEFAULT_REMINDER_TIME;
  }

  return user.reminder2Time && HHMM_REGEX.test(user.reminder2Time)
    ? user.reminder2Time
    : null;
}

function getScheduledReminderJobId(
  user: Doc<"users">,
  slot: ReminderSlot
): string | undefined {
  return slot === 1 ? user.reminder1ScheduledJobId : user.reminder2ScheduledJobId;
}

function toScheduledFunctionId(
  id: string | undefined
): Id<"_scheduled_functions"> | null {
  return id ? (id as Id<"_scheduled_functions">) : null;
}

export const getUserById = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
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

export const patchReminderScheduledJobId = internalMutation({
  args: {
    userId: v.id("users"),
    slot: v.union(v.literal(1), v.literal(2)),
    scheduledJobId: v.union(v.string(), v.null()),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(
      args.userId,
      args.slot === 1
        ? { reminder1ScheduledJobId: args.scheduledJobId ?? undefined }
        : { reminder2ScheduledJobId: args.scheduledJobId ?? undefined }
    );
  },
});

export const scheduleReminderSlot = internalAction({
  args: {
    userId: v.id("users"),
    slot: v.union(v.literal(1), v.literal(2)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.reminders.getUserById, {
      userId: args.userId,
    });
    if (!user) return null;

    const reminderTime = getReminderTimeForSlot(user, args.slot);
    if (user.remindersEnabled === false || !user.timezone || !reminderTime) {
      await ctx.runMutation(internal.reminders.patchReminderScheduledJobId, {
        userId: args.userId,
        slot: args.slot,
        scheduledJobId: null,
      });
      return null;
    }

    const runAt = getNextReminderRunAt(user.timezone, reminderTime);
    const jobId = await ctx.scheduler.runAt(
      runAt,
      internal.reminders.deliverScheduledReminder,
      {
        userId: args.userId,
        slot: args.slot,
      }
    );

    await ctx.runMutation(internal.reminders.patchReminderScheduledJobId, {
      userId: args.userId,
      slot: args.slot,
      scheduledJobId: jobId,
    });

    return null;
  },
});

export const rescheduleReminderJobs = internalAction({
  args: { userId: v.id("users") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.reminders.getUserById, {
      userId: args.userId,
    });
    if (!user) return null;

    for (const slot of [1, 2] as const) {
      const scheduledJobId = toScheduledFunctionId(getScheduledReminderJobId(user, slot));
      if (scheduledJobId) {
        try {
          await ctx.scheduler.cancel(scheduledJobId);
        } catch (error) {
          console.error(
            `Failed to cancel existing reminder job for user ${user._id}, slot ${slot}:`,
            error
          );
        }
      }

      await ctx.runMutation(internal.reminders.patchReminderScheduledJobId, {
        userId: args.userId,
        slot,
        scheduledJobId: null,
      });
    }

    if (user.remindersEnabled === false || !user.timezone?.trim()) {
      return null;
    }

    await ctx.runAction(internal.reminders.scheduleReminderSlot, {
      userId: args.userId,
      slot: 1,
    });

    if (getReminderTimeForSlot(user, 2)) {
      await ctx.runAction(internal.reminders.scheduleReminderSlot, {
        userId: args.userId,
        slot: 2,
      });
    }

    return null;
  },
});

export const deliverScheduledReminder = internalAction({
  args: {
    userId: v.id("users"),
    slot: v.union(v.literal(1), v.literal(2)),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await ctx.runQuery(internal.reminders.getUserById, {
      userId: args.userId,
    });
    if (!user) return null;

    await ctx.runMutation(internal.reminders.patchReminderScheduledJobId, {
      userId: args.userId,
      slot: args.slot,
      scheduledJobId: null,
    });

    const reminderTime = getReminderTimeForSlot(user, args.slot);
    if (user.remindersEnabled === false || !user.timezone || !reminderTime) {
      return null;
    }

    const { dateStr: todayStr, minutesSinceMidnight: currentMinutes } =
      getTodayAndCurrentMinutesInTz(user.timezone);
    const reminderMinutes = parseMinutesSinceMidnight(reminderTime);
    const lastSentDate =
      args.slot === 1 ? user.reminder1LastSentDate : user.reminder2LastSentDate;

    if (
      !isInReminderWindow(currentMinutes, reminderMinutes, REMINDER_WINDOW_MINUTES)
    ) {
      console.log(
        `Skipping stale reminder for user ${user._id}, slot ${args.slot}: expected ${reminderTime} in ${user.timezone}`
      );
      await ctx.runAction(internal.reminders.scheduleReminderSlot, {
        userId: args.userId,
        slot: args.slot,
      });
      return null;
    }

    let sent = false;

    if (lastSentDate !== todayStr) {
      const sub = await ctx.runQuery(internal.reminders.getPushSubscriptionForUser, {
        userId: user._id,
      });
      if (sub) {
        try {
          await ctx.runAction(internal.remindersSend.sendPushPayload, {
            endpoint: sub.endpoint,
            p256dh: sub.p256dh,
            auth: sub.auth,
          });
          sent = true;
        } catch (pushErr) {
          console.error(`Push failed for user ${user._id}:`, pushErr);
        }
      } else {
        console.log(`No push subscription found for user ${user._id}`);
      }
    }

    if (sent && lastSentDate !== todayStr) {
      await ctx.runMutation(internal.reminders.markReminderSent, {
        userId: user._id,
        slot: args.slot,
        dateStr: todayStr,
      });
    }

    await ctx.runAction(internal.reminders.scheduleReminderSlot, {
      userId: args.userId,
      slot: args.slot,
    });

    return null;
  },
});

const reminderChannelValidator = v.literal("push");

const reminderSettingsValidator = v.object({
  remindersEnabled: v.boolean(),
  reminder1Time: v.string(),
  reminder2Time: v.union(v.string(), v.null()),
  reminderChannel: reminderChannelValidator,
  timezone: v.union(v.string(), v.null()),
  pushSubscriptionExists: v.boolean(),
});

export const updateReminderSettings = mutation({
  args: {
    remindersEnabled: v.optional(v.boolean()),
    reminder1Time: v.optional(v.string()),
    reminder2Time: v.optional(v.union(v.string(), v.null())),
    reminderChannel: v.optional(reminderChannelValidator),
    timezone: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const clerkId = identity?.subject;
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
      args.reminderChannel !== "push"
    ) {
      throw new Error("Only push reminders are supported");
    }

    const updates: {
      remindersEnabled?: boolean;
      reminder1Time?: string;
      reminder2Time?: string;
      reminderChannel?: "push";
      timezone?: string;
      updatedAt: number;
    } = { updatedAt: Date.now() };

    if (args.remindersEnabled !== undefined)
      updates.remindersEnabled = args.remindersEnabled;
    if (args.reminder1Time !== undefined) updates.reminder1Time = args.reminder1Time;
    if (args.reminder2Time !== undefined)
      updates.reminder2Time = args.reminder2Time ?? undefined;
    updates.reminderChannel = "push";
    if (args.timezone !== undefined) updates.timezone = args.timezone.trim();

    await ctx.db.patch(user._id, updates);
    await ctx.scheduler.runAfter(0, internal.reminders.rescheduleReminderJobs, {
      userId: user._id,
    });
    return user._id;
  },
});

export const savePushSubscription = mutation({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
  },
  returns: v.id("pushSubscriptions"),
  handler: async (ctx, args) => {
    if (!args.endpoint?.trim() || !args.p256dh?.trim() || !args.auth?.trim()) {
      throw new Error("endpoint, p256dh, and auth are required");
    }
    const identity = await ctx.auth.getUserIdentity();
    const clerkId = identity?.subject;
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
      await ctx.scheduler.runAfter(0, internal.reminders.rescheduleReminderJobs, {
        userId,
      });
      return existing._id;
    }
    const insertedId = await ctx.db.insert("pushSubscriptions", payload);
    await ctx.scheduler.runAfter(0, internal.reminders.rescheduleReminderJobs, {
      userId,
    });
    return insertedId;
  },
});

export const getReminderSettings = query({
  args: {},
  returns: v.union(reminderSettingsValidator, v.null()),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    const clerkId = identity?.subject;
    if (!clerkId) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", clerkId))
      .unique();
    if (!user) return null;
    const pushSubscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    return {
      remindersEnabled: user.remindersEnabled ?? false,
      reminder1Time: user.reminder1Time ?? DEFAULT_REMINDER_TIME,
      reminder2Time: user.reminder2Time ?? null,
      reminderChannel: "push" as const,
      timezone: user.timezone ?? null,
      pushSubscriptionExists: pushSubscription !== null,
    };
  },
});

export const getPushSubscriptionByClerkId = internalQuery({
  args: { clerkId: v.string() },
  returns: v.union(
    v.object({
      endpoint: v.string(),
      p256dh: v.string(),
      auth: v.string(),
    }),
    v.null()
  ),
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerk_id", (q) => q.eq("clerkId", args.clerkId))
      .unique();
    if (!user) return null;

    const subscription = await ctx.db
      .query("pushSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .first();
    if (!subscription) return null;

    return {
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    };
  },
});

export const sendTestPush = action({
  args: {},
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    const clerkId = identity?.subject;
    if (!clerkId) throw new Error("Not authenticated");

    const subscription = await ctx.runQuery(
      internal.reminders.getPushSubscriptionByClerkId,
      { clerkId }
    );
    if (!subscription) {
      throw new Error(
        "No push subscription found yet. Save push reminders first, then try again."
      );
    }

    await ctx.runAction(internal.remindersSend.sendPushPayload, {
      endpoint: subscription.endpoint,
      p256dh: subscription.p256dh,
      auth: subscription.auth,
      title: "Book-Trackr test notification",
      body: "Push is connected. Your daily reminders can reach this device now.",
      url: "/dashboard/settings",
      tag: "book-trackr-test",
    });

    return { ok: true };
  },
});
