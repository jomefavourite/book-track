import { ConvexError } from "convex/values";
import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";

type AuthCtx = QueryCtx | MutationCtx | ActionCtx;

/**
 * The signed-in caller's Clerk ID, read from the verified Clerk JWT.
 *
 * Never take a user ID from function arguments to decide who the caller is:
 * Clerk IDs are public (profile URLs, sitemap, public book data), so anyone
 * could pass someone else's.
 */
export async function getClerkId(ctx: AuthCtx): Promise<string | null> {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}

/** Like `getClerkId`, but throws when nobody is signed in. */
export async function requireClerkId(ctx: AuthCtx): Promise<string> {
  const clerkId = await getClerkId(ctx);
  if (!clerkId) {
    throw new ConvexError("Not authenticated");
  }
  return clerkId;
}

/** The signed-in caller's Clerk ID plus the name and email from their token. */
export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity?.subject) {
    throw new ConvexError("Not authenticated");
  }
  return {
    clerkId: identity.subject,
    name: identity.name,
    email: identity.email,
  };
}
