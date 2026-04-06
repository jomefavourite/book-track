import { AuthConfig } from "convex/server";

/**
 * Convex auth for Clerk. Set CLERK_JWT_ISSUER_DOMAIN in the Convex dashboard
 * (from your Clerk JWT template named "convex") so getBooksForProfile can
 * verify the viewer and only show private books to the profile owner.
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN!,
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
