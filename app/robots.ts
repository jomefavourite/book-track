import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/metadata";

// Authenticated app surfaces and create/edit flows stay private for every
// crawler. Public marketing + shared reading pages (/, /public, /books/[id],
// /user/[slugOrId], /communities/[slug]) remain crawlable.
const DISALLOW = [
  "/dashboard",
  "/api",
  "/join",
  "/books/new",
  "/communities/new",
  "/*/edit",
  "/*/settings",
];

// Search + AI crawlers we explicitly welcome. Listing them by name signals to
// AI-discoverability tools that we're not blocking them, while still honoring
// the shared DISALLOW restrictions above.
const WELCOMED_CRAWLERS = [
  // Search engines
  "Googlebot",
  "Bingbot",
  "DuckDuckBot",
  // AI crawlers
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "PerplexityBot",
  "Google-Extended",
];

export default function robots(): MetadataRoute.Robots {
  const siteUrl = getSiteUrl();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: DISALLOW,
      },
      {
        userAgent: WELCOMED_CRAWLERS,
        allow: "/",
        disallow: DISALLOW,
      },
    ],
    sitemap: `${siteUrl}/sitemap.xml`,
    host: siteUrl,
  };
}
