import { getSiteUrl } from "@/lib/metadata";

// Served at /llms.txt. Generated as a route handler (rather than a static
// public/ file) so the links stay consistent with the configured site URL,
// matching how robots.ts and sitemap.ts build their output.
export const revalidate = 3600;

export function GET(): Response {
  const siteUrl = getSiteUrl();

  const body = `# Book-Trackr

> Book-Trackr is a Progressive Web App for tracking your reading progress. Plan a book across a calendar month range or a fixed number of days, mark days as read, track actual pages read, and get catch-up suggestions when you fall behind. Share your reading journey publicly and read alongside communities.

## Key pages

- [Home](${siteUrl}/): Landing page and reading-tracker overview.
- [Public library](${siteUrl}/public): Browse public reading journeys and see how readers are tracking their books.
- [Live Room](${siteUrl}/live): Watch readers arrive on Book-Trackr in real time.
- [Communities](${siteUrl}/communities): Discover and join Book-Trackr reading communities.
- [Dashboard](${siteUrl}/dashboard): Signed-in home for managing your books and progress (requires authentication).

## Features

- Calendar mode: select a month range and distribute reading across days.
- Fixed-days mode: set a specific number of days to complete a book.
- Progress tracking: mark days read/unread and record actual pages read.
- Catch-up suggestions: get schedule-aware suggestions when you miss reading days.
- Multi-month support: read books across multiple months.
- Reading communities: shared, community-defined day labels and reading groups.
- PWA + offline support: install as a native app and keep working offline with local sync.
- Daily reminder notifications: optional web-push reminders.

## Documentation

- Overview: Book-Trackr is built with Next.js, Convex, and Tailwind CSS. Project overview, feature list, tech stack, and setup instructions live in the repository README.md.

## Contact

- Author: Favourite Jome — https://favouritejome.com
`;

  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
