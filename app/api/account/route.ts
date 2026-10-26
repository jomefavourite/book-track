import { auth, clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { ConvexError } from "convex/values";
import { api } from "@/convex/_generated/api";

/**
 * DELETE /api/account — permanently deletes the signed-in user's account.
 * Removes their BookTrackr data from Convex first (as the user, so Convex
 * enforces that they can only delete themselves), then the Clerk account.
 */
export async function DELETE() {
  const { userId, getToken } = await auth();
  if (!userId) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const token = await getToken({ template: "convex" });
  if (!convexUrl || !token) {
    return Response.json(
      { error: "Couldn't verify your session. Please sign in again." },
      { status: 500 }
    );
  }

  const convex = new ConvexHttpClient(convexUrl);
  convex.setAuth(token);

  try {
    await convex.mutation(api.account.deleteMyAccount, {});
  } catch (error) {
    const message =
      error instanceof ConvexError && typeof error.data === "string"
        ? error.data
        : "We couldn't delete your data. Nothing was removed; please try again.";
    return Response.json({ error: message }, { status: 400 });
  }

  try {
    const clerk = await clerkClient();
    await clerk.users.deleteUser(userId);
  } catch (error) {
    console.error(`Deleted Convex data but failed to delete Clerk user ${userId}:`, error);
    return Response.json(
      {
        error:
          "Your BookTrackr data was deleted, but we couldn't remove your sign-in account. Email hello@booktrackr.app and we'll finish it.",
      },
      { status: 500 }
    );
  }

  return Response.json({ deleted: true });
}
