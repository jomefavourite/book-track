"use node";

import { internalAction } from "./_generated/server";
import { v } from "convex/values";
import webpush from "web-push";

const REMINDER_TITLE = "Time to read!";
const REMINDER_BODY = "You have reading planned for today. Open the app to log your progress.";

export const sendPushPayload = internalAction({
  args: {
    endpoint: v.string(),
    p256dh: v.string(),
    auth: v.string(),
    title: v.optional(v.string()),
    body: v.optional(v.string()),
    url: v.optional(v.string()),
    tag: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
    if (!vapidPublicKey || !vapidPrivateKey) {
      throw new Error("VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set");
    }
    webpush.setVapidDetails(
      "mailto:support@book-trackr.app",
      vapidPublicKey,
      vapidPrivateKey
    );
    const subscription = {
      endpoint: args.endpoint,
      keys: { p256dh: args.p256dh, auth: args.auth },
    };
    const payload = JSON.stringify({
      title: args.title?.trim() || REMINDER_TITLE,
      body: args.body?.trim() || REMINDER_BODY,
      url: args.url?.trim() || "/dashboard",
      tag: args.tag?.trim() || "book-trackr-reminder",
    });
    await webpush.sendNotification(subscription, payload);
    return null;
  },
});
