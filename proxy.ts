import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/public(.*)", // Public books gallery
  "/books(.*)", // Allow viewing public books without auth
  "/sign-in(.*)",
  "/sign-up(.*)",
]);

const isProtectedRoute = createRouteMatcher([
  "/dashboard(.*)",
  "/books/new(.*)",
  "/books/:id/edit(.*)",
]);

export default clerkMiddleware(async (auth, request) => {
  // Protect specific routes that require authentication
  if (isProtectedRoute(request)) {
    await auth.protect();
  }
  // Other routes are public (landing page, public books)
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};

