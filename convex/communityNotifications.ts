import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";

/**
 * Sends a push notification to every owner/admin of a community when a new
 * member joins. Scheduled from acceptInvite so the join mutation stays fast.
 */
export const notifyAdminsOfNewMember = internalMutation({
  args: {
    communityId: v.id("communities"),
    newMemberClerkId: v.string(),
    newMemberName: v.string(),
    communityName: v.string(),
    communitySlug: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const members = await ctx.db
      .query("communityMembers")
      .withIndex("by_community", (q) => q.eq("communityId", args.communityId))
      .collect();

    const adminMembers = members.filter(
      (member) =>
        member.status === "active" &&
        (member.role === "owner" || member.role === "admin") &&
        member.clerkId !== args.newMemberClerkId
    );

    for (const admin of adminMembers) {
      const user = await ctx.db
        .query("users")
        .withIndex("by_clerk_id", (q) => q.eq("clerkId", admin.clerkId))
        .unique();
      if (!user) continue;

      const subscriptions = await ctx.db
        .query("pushSubscriptions")
        .withIndex("by_user", (q) => q.eq("userId", user._id))
        .collect();

      for (const subscription of subscriptions) {
        await ctx.scheduler.runAfter(
          0,
          internal.remindersSend.sendPushPayload,
          {
            endpoint: subscription.endpoint,
            p256dh: subscription.p256dh,
            auth: subscription.auth,
            title: "New member joined",
            body: `${args.newMemberName} just joined ${args.communityName}`,
            url: `/communities/${args.communitySlug}`,
            tag: `community-join-${args.communityId}`,
          }
        );
      }
    }

    return null;
  },
});
